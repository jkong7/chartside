import { llmEnabled, llmModel } from "@/lib/llm";
import { authed, body, fail, json } from "@/lib/server/http";
import { consentScript } from "@/lib/server/pipeline";
import { artifacts, audit, consents, encounters, feedback, notes, orders, patientFlags, patients, templates, utterances } from "@/lib/server/repo";
import type { Encounter } from "@/lib/types";

export const GET = authed<{ id: string }>((_req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const patient = enc.patientId ? patients.get(user.id, enc.patientId) ?? null : null;
  const rec = notes.latest(enc.id);
  const tplId = enc.templateId ?? user.prefs.defaultTemplate ?? "soap";
  return json({
    encounter: enc,
    patient,
    template: templates.get(user.id, tplId) ?? templates.get(user.id, "soap"),
    templates: templates.list(user.id).map((t) => ({ id: t.id, name: t.name, specialty: t.specialty })),
    consent: consents.latest(enc.id) ?? null,
    consentScript: consentScript(user.name, user.prefs.state ?? "IL"),
    state: user.prefs.state ?? "IL",
    utterances: utterances.list(enc.id),
    note: rec ? { version: rec.version, status: rec.status, engine: rec.engine, content: rec.content, updatedAt: rec.updatedAt } : null,
    artifacts: artifacts.all(enc.id),
    orders: orders.list(enc.id),
    audit: audit.forEncounter(enc.id),
    feedback: feedback.forEncounter(enc.id),
    patientFlags: patientFlags.list(enc.id),
    engine: { llm: llmEnabled(), model: llmEnabled() ? llmModel() : null },
  });
});

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<Partial<Encounter> & { action?: "start" | "pause" | "resume" | "reset" }>(req);
  const patch: Partial<Encounter> = {};
  for (const k of ["reason", "visitType", "templateId", "setting", "inputLang", "outputLang", "patientId"] as const) if (b[k] !== undefined) (patch as Record<string, unknown>)[k] = b[k];
  if (b.action === "start") {
    const consent = consents.latest(enc.id);
    if (!consent || consent.decision !== "granted") return fail("Record patient consent before starting ambient capture", 409);
    if (enc.status === "signed") return fail("This visit is already signed", 409);
    patch.status = "recording";
    patch.startedAt = enc.startedAt ?? new Date().toISOString();
    audit.log(user.id, enc.id, "capture.started", {});
  }
  if (b.action === "pause") { patch.status = "paused"; audit.log(user.id, enc.id, "capture.paused", {}); }
  if (b.action === "resume") { patch.status = "recording"; audit.log(user.id, enc.id, "capture.resumed", {}); }
  if (b.action === "reset") {
    if (enc.status === "signed") return fail("Signed visits cannot be reset", 409);
    utterances.clear(enc.id);
    patch.status = "scheduled";
    patch.startedAt = null;
    patch.endedAt = null;
    patch.durationS = 0;
    audit.log(user.id, enc.id, "capture.reset", {});
  }
  if (b.durationS !== undefined) patch.durationS = Math.max(0, Math.round(b.durationS));
  return json({ encounter: encounters.update(user.id, enc.id, patch) });
});
