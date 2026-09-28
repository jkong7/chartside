import { llmEnabled, llmModel } from "@/lib/llm";
import { authed, body, fail, json } from "@/lib/server/http";
import { speechConfig } from "@/lib/server/audio";
import { consentScript, processEncounter } from "@/lib/server/pipeline";
import { isStuck, recordingMinutesFromEnv } from "@/lib/engine/limits";
import { assertNoteAccess, logView } from "@/lib/server/access";
import { assertCan, can, canSign } from "@/lib/server/policy";
import { addenda, artifacts, audioChunks, audit, claims, consents, encounters, feedback, notes, orders, orgs, patientFlags, patients, SEES_ORG, templates, users, utterances } from "@/lib/server/repo";
import type { Encounter } from "@/lib/types";
import { attestationsFor } from "@/lib/engine/attest";
import { verifyChain, type Cosign } from "@/lib/server/signoff";
import { tasks } from "@/lib/server/inbox";
import { documents } from "@/lib/server/documents";
import { qualityFor } from "@/lib/server/quality";
import type { MeasureResult } from "@/lib/engine/quality";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  let enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  if (isStuck(enc) && can(user, "clinical.capture")) {
    await audit.log(user, enc.id, "note.recovered", { endedAt: enc.endedAt });
    try {
      await processEncounter(user, enc.id);
    } catch {
      await encounters.update(user, enc.id, { status: "paused" });
    }
    enc = (await encounters.get(user, id))!;
  }
  await assertNoteAccess(user, enc);
  await logView(user, enc.id);
  const clinician = enc.userId === user.id ? user : await users.byId(enc.userId);
  const prefs = clinician?.prefs ?? user.prefs;
  const tplId = enc.templateId ?? prefs.defaultTemplate ?? "soap";
  const [patient, rec, template, tpls, consent, utts, arts, ords, aud, fb, flags, chunks, claim, adds, chain] = await Promise.all([
    enc.patientId ? patients.get(user, enc.patientId) : Promise.resolve(undefined),
    notes.latest(enc.id),
    templates.get(user, tplId).then(async (t) => t ?? (await templates.get(user, "soap"))),
    templates.list(user),
    consents.latest(enc.id),
    utterances.list(enc.id),
    artifacts.all(enc.id),
    orders.list(enc.id),
    audit.forEncounter(enc.id),
    feedback.forEncounter(enc.id),
    patientFlags.list(enc.id),
    audioChunks.list(enc.id),
    claims.get(enc.id),
    addenda.list(enc.id),
    verifyChain(enc.id),
  ]);
  const encTasks = await tasks.forEncounter(enc.id);
  const quality = (arts.quality as unknown as MeasureResult[] | undefined) ?? (enc.status === "scheduled" ? await qualityFor(user, enc, { save: false }) : null) ?? [];
  const cosign = (arts.cosign ?? undefined) as unknown as Cosign | undefined;
  const supervises = !!cosign && (cosign.supervisorId === user.id || (enc.userId !== user.id && (await orgs.membership(user.orgId, enc.userId))?.supervisor_id === user.id));
  return json({
    encounter: enc,
    patient: patient ?? null,
    template,
    templates: tpls.map((t) => ({ id: t.id, name: t.name, specialty: t.specialty })),
    consent: consent ?? null,
    consentScript: consentScript(clinician?.name ?? user.name, prefs.state ?? "IL"),
    state: prefs.state ?? "IL",
    utterances: utts,
    note: rec ? { version: rec.version, status: rec.status, engine: rec.engine, content: rec.content, updatedAt: rec.updatedAt } : null,
    artifacts: arts,
    orders: ords,
    audit: aud,
    feedback: fb,
    patientFlags: flags,
    engine: { llm: llmEnabled(), model: llmEnabled() ? llmModel() : null },
    audio: { chunks: chunks.length, bytes: chunks.reduce((n, x) => n + x.bytes, 0), durationMs: chunks.at(-1)?.tMs ?? 0, retentionDays: prefs.audioRetentionDays ?? 0 },
    speech: speechConfig(),
    limits: { recordingMinutes: recordingMinutesFromEnv() },
    claim: claim ?? null,
    addenda: adds,
    tasks: encTasks,
    quality,
    admission: enc.admissionId ? await (async () => { const { admissions, hospitalDay } = await import("@/lib/server/inpatient"); const a = await admissions.get(user, enc.admissionId!); return a ? { id: a.id, unit: a.unit, room: a.room, day: hospitalDay(a, enc.scheduledAt), status: a.status, reason: a.reason } : null; })() : null,
    group: enc.visitType === "group" ? await (async () => { const { groups } = await import("@/lib/server/group"); const rec = await groups.byEncounter(user, enc.id); const g = rec ?? (await groups.forMember(user, enc.id)); return g ? { id: g.id, title: g.title, members: g.members.length, role: rec ? "recording" as const : "member" as const } : null; })() : null,
    documents: (await documents.list(enc.id)).map((d) => ({ id: d.id, status: d.status })),
    chain,
    attestations: cosign ? attestationsFor(cosign.authorCredential).map((a) => ({ key: a.key, label: a.label, modifier: a.modifier, source: a.source, preview: a.text({ supervisor: user.name, author: cosign.authorName }) })) : [],
    clinician: { id: enc.userId, name: clinician?.name ?? "Unknown" },
    colleagues: enc.userId === user.id || SEES_ORG.has(user.role) ? (await orgs.members(user.orgId)).filter((m) => m.status === "active" && m.userId !== enc.userId).map((m) => ({ id: m.userId, name: m.name, role: m.role })) : [],
    access: {
      share: enc.userId === user.id || SEES_ORG.has(user.role),
      userId: user.id,
      role: user.role,
      capture: can(user, "clinical.capture"),
      edit: can(user, "clinical.edit"),
      sign: canSign(user, enc),
      billingReview: can(user, "billing.review"),
      cosign: supervises && cosign?.status === "pending",
      addendum: enc.status === "signed" && (enc.userId === user.id || supervises),
    },
  });
});

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.capture");
  const b = await body<Partial<Encounter> & { action?: "start" | "pause" | "resume" | "reset"; manual?: boolean; captureMode?: "single" | "dual" }>(req);
  if (b.captureMode) await artifacts.set(enc.id, "capture", { mode: b.captureMode === "dual" ? "dual" : "single", at: new Date().toISOString() });
  const patch: Partial<Encounter> = {};
  for (const k of ["reason", "visitType", "templateId", "setting", "inputLang", "outputLang", "patientId"] as const) if (b[k] !== undefined) (patch as Record<string, unknown>)[k] = b[k];
  if (b.action === "start") {
    const consent = await consents.latest(enc.id);
    if (!consent) return fail("Record patient consent before starting ambient capture", 409);
    if (consent.decision !== "granted" && !b.manual) return fail("The patient declined recording. Only manual documentation is available.", 409);
    if (enc.status === "signed") return fail("This visit is already signed", 409);
    patch.status = "recording";
    patch.startedAt = enc.startedAt ?? new Date().toISOString();
    await audit.log(user, enc.id, b.manual ? "capture.manual" : "capture.started", {});
  }
  if (b.action === "pause") { patch.status = "paused"; await audit.log(user, enc.id, "capture.paused", {}); }
  if (b.action === "resume") { patch.status = "recording"; await audit.log(user, enc.id, "capture.resumed", {}); }
  if (b.action === "reset") {
    if (enc.status === "signed") return fail("Signed visits cannot be reset", 409);
    await utterances.clear(enc.id);
    patch.status = "scheduled";
    patch.startedAt = null;
    patch.endedAt = null;
    patch.durationS = 0;
    await audit.log(user, enc.id, "capture.reset", {});
  }
  if (b.durationS !== undefined) patch.durationS = Math.max(0, Math.round(b.durationS));
  return json({ encounter: await encounters.update(user, enc.id, patch) });
});
