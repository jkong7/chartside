import { CORE_DECISIONS, isCore } from "../edition";
import { createHash } from "node:crypto";
import { clockTime, tzOf } from "../tz";
import { all, get, now, run, uid } from "../db";
import { attestationsFor } from "../engine/attest";
import { noteToText } from "../engine/note";
import type { CodingResult, Note } from "../types";
import { closeMessage, messages, prepareDraft, sendReply, tasks } from "./inbox";
import { deleteAudio } from "./audio";
import { notifyForEncounter } from "./notify";
import { assist, reviseDiagnoses, saveNoteEdits, signEncounter } from "./pipeline";
import { Forbidden, Invalid } from "./policy";
import { unsignedQueue } from "./queue";
import { artifacts, audit, encounters, notes, patients, utterances, type User } from "./repo";
import { cosignNote, pendingCosigns, returnNote } from "./signoff";
import type { TaskKind } from "../engine/tasks";

export type DecisionKind = "note.sign" | "note.cosign" | "coding.query" | "message.reply" | "patient.match" | "task.review" | "claim.exception" | "proposal";
export type ProposalKind = "note.edit" | "dx.add" | "dx.remove" | "task.create" | "message.reply";
export type DecisionAction = "approve" | "reject" | "snooze" | "draft";
export type DecisionChannel = "stack" | "web" | "voice" | "sms" | "agent" | "api";

export interface DecisionActionSpec {
  action: DecisionAction;
  label: string;
  needsScreen: boolean;
  payload?: string[];
}

export interface Decision {
  id: string;
  kind: DecisionKind;
  proposalKind?: ProposalKind;
  title: string;
  summary: string;
  safeLabel: string;
  encounterId: string | null;
  patientId: string | null;
  patientName: string | null;
  priority: 0 | 1 | 2 | 3;
  at: string;
  actions: DecisionActionSpec[];
  detail: Record<string, unknown>;
  openUrl: string;
}

export interface DecisionResult {
  ok: boolean;
  id: string;
  action: DecisionAction;
  message: string;
  blockers?: string[];
  detail?: Record<string, unknown>;
}

const SCREEN: DecisionChannel[] = ["stack", "web"];
export const FAST_REVIEW_MS = 20000;
export const FAST_REVIEW_WORDS = 300;

const snooze: DecisionActionSpec = { action: "snooze", label: "Later", needsScreen: false, payload: ["minutes"] };
const time = (u: User, iso: string) => clockTime(iso, tzOf(u));
const contentHash = (note: Note) => createHash("sha256").update(JSON.stringify(note.sections)).digest("hex");
const words = (note: Note | undefined) => (note ? note.sections.flatMap((s) => s.sentences).filter((s) => !s.pending).reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0) : 0);

async function patientName(u: User, patientId: string | null) {
  return patientId ? ((await patients.get(u, patientId))?.name ?? null) : null;
}

async function sendQueuedSummary(u: User, encId: string) {
  const queued = await artifacts.get<{ at: string; sentAt?: string }>(encId, "summary_on_sign");
  if (!queued || queued.sentAt) return null;
  const enc = await encounters.get(u, encId);
  if (!enc?.patientId) return null;
  let share = await artifacts.get<{ token: string; createdAt: string }>(encId, "share");
  if (!share) {
    share = { token: createHash("sha256").update(`${encId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 32), createdAt: now() };
    await artifacts.set(encId, "share", share);
    await audit.log(u, encId, "summary.shared", { via: "sign" });
  }
  const origin = (process.env.CHARTSIDE_PUBLIC_URL || "http://localhost:3100").replace(/\/$/, "");
  try {
    const r = await notifyForEncounter(u, encId, "summary", `${origin}/s/${share.token}`);
    await artifacts.set(encId, "summary_on_sign", { ...queued, sentAt: now(), status: r.status });
    return r.status === "sent" ? "The patient's summary is on its way." : `The patient's summary wasn't sent (${r.error ?? r.status}). Send it from the visit.`;
  } catch (err) {
    await artifacts.set(encId, "summary_on_sign", { ...queued, sentAt: now(), status: "failed" });
    return `The patient's summary wasn't sent: ${err instanceof Error ? err.message : "error"}`;
  }
}

async function signCards(u: User): Promise<Decision[]> {
  const queue = await unsignedQueue(u);
  return Promise.all(queue.map(async (q) => {
    const enc = (await encounters.get(u, q.id))!;
    const rec = await notes.latest(q.id);
    const origin = await artifacts.get<{ channel?: string }>(q.id, "capture_origin");
    const ready = await artifacts.get<{ at: string; callSid?: string; sim?: boolean }>(q.id, "phone_ready");
    const call = await artifacts.get<{ verifiedBy?: string; scheduledVisit?: boolean }>(q.id, "phone_call");
    const summaryOnSign = await artifacts.get<{ at: string }>(q.id, "summary_on_sign");
    const fromPatient = await artifacts.get<{ label: string; clinicianNameGiven?: string | null }>(q.id, "patient_recording");
    const unverified = call?.verifiedBy === "caller-id";
    const discardable = !!origin && !call?.scheduledVisit && (enc.status === "review" || (enc.status === "paused" && !!(origin as { error?: string }).error));
    return {
      id: `sign:${q.id}`,
      kind: "note.sign" as const,
      title: `Sign note: ${enc.patientId ? q.patient : `${time(u, enc.startedAt ?? q.scheduledAt)} visit`}${fromPatient ? " (from a patient's recording)" : ""}`,
      summary: [q.reason, `${words(rec?.content)} words`, q.blockers.length ? `${q.blockers.length} to fix first` : "ready"].filter(Boolean).join(" · "),
      safeLabel: `Note ready to sign (${time(u, enc.startedAt ?? q.scheduledAt)} visit)`,
      encounterId: q.id,
      patientId: enc.patientId,
      patientName: enc.patientId ? q.patient : null,
      priority: ready ? 0 : q.ageHours >= 24 ? 1 : 2,
      at: enc.endedAt ?? q.scheduledAt,
      actions: [{ action: "approve", label: "Sign", needsScreen: true, payload: ["reviewMs", "force"] }, ...(discardable ? [{ action: "reject" as const, label: unverified ? "I didn't make this call, delete it" : "Delete this recording", needsScreen: true }] : []), snooze],
      detail: { blockers: q.blockers, words: words(rec?.content), ageHours: q.ageHours, text: rec ? noteToText(rec.content) : "", channel: origin?.channel ?? null, markedReady: ready ? { at: ready.at, label: `Marked ready on a ${ready.sim ? "browser " : ""}call at ${time(u, ready.at)}` } : null, unverifiedCaller: unverified ? { label: "Caller ID only, no PIN", help: "If you didn't make this call, delete it." } : null, summaryOnSign: summaryOnSign && enc.patientId ? { label: "Patient summary goes out when you sign" } : null, fromPatient: fromPatient ? { label: fromPatient.label, help: "The patient recorded this on their own phone and offered you the draft. Check it against your memory of the visit before you sign.", transcript: (await utterances.list(q.id)).filter((x) => !x.redacted).slice(0, 400).map((x) => ({ speaker: x.speaker, text: x.text })) } : null },
      openUrl: `/encounters/${q.id}`,
    };
  }));
}

async function cosignCards(u: User): Promise<Decision[]> {
  return Promise.all((await pendingCosigns(u)).map(async (c) => {
    const enc = await encounters.get(u, c.encounterId);
    const name = await patientName(u, enc?.patientId ?? null);
    return {
      id: `cosign:${c.encounterId}`,
      kind: "note.cosign" as const,
      title: `Co-sign ${c.cosign.authorName}'s note${name ? `: ${name}` : ""}`,
      summary: c.reason || "Waiting for your co-signature",
      safeLabel: `Co-signature requested (${time(u, c.cosign.requestedAt)})`,
      encounterId: c.encounterId,
      patientId: enc?.patientId ?? null,
      patientName: name,
      priority: 1,
      at: c.cosign.requestedAt,
      actions: [{ action: "approve", label: "Co-sign", needsScreen: true, payload: ["attestation", "comment"] }, { action: "reject", label: "Return", needsScreen: true, payload: ["comment"] }, snooze],
      detail: { author: c.cosign.authorName, attestations: attestationsFor(c.cosign.authorCredential).map((a) => ({ key: a.key, label: a.label })) },
      openUrl: `/encounters/${c.encounterId}`,
    };
  }));
}

async function queryCards(u: User): Promise<Decision[]> {
  const out: Decision[] = [];
  for (const e of await encounters.list(u, { statuses: ["review"], clinicianId: u.id })) {
    const coding = await artifacts.get<CodingResult>(e.id, "coding");
    for (const d of coding?.dxDetail ?? []) {
      const q = d.query;
      if (!q || q.answer) continue;
      out.push({
        id: `cdi:${e.id}:${q.id}`,
        kind: "coding.query",
        title: q.question,
        summary: `${d.code} · choose the most specific diagnosis`,
        safeLabel: "Documentation question",
        encounterId: e.id,
        patientId: e.patientId,
        patientName: await patientName(u, e.patientId),
        priority: 2,
        at: e.endedAt ?? e.scheduledAt,
        actions: [{ action: "approve", label: "Answer", needsScreen: true, payload: ["code"] }, snooze],
        detail: { queryId: q.id, code: q.code, options: [...q.options, { code: null, label: "Clinically undetermined" }], evidence: q.evidence },
        openUrl: `/encounters/${e.id}`,
      });
    }
  }
  return out;
}

async function messageCards(u: User): Promise<Decision[]> {
  if (!["owner", "admin", "clinician"].includes(u.role)) return [];
  const list = (await messages.list(u, { open: true, mine: true })).filter((m) => m.assigneeId === u.id);
  return list.map((m) => ({
    id: `msg:${m.id}`,
    kind: "message.reply" as const,
    title: `Reply to ${m.patientName}`,
    summary: m.subject || m.body.slice(0, 80),
    safeLabel: m.triage.urgency === "emergency" ? "Urgent patient message" : "Patient message",
    encounterId: m.encounterId,
    patientId: m.patientId,
    patientName: m.patientName,
    priority: m.triage.urgency === "emergency" ? 0 : m.triage.urgency === "same_day" ? 1 : 2,
    at: m.receivedAt,
    actions: [m.draft ? { action: "approve" as const, label: "Send reply", needsScreen: true, payload: ["text"] } : { action: "draft" as const, label: "Draft a reply", needsScreen: false }, { action: "reject" as const, label: "Close", needsScreen: true }, snooze],
    detail: { body: m.body, draft: m.draft, urgency: m.triage.urgency, reasons: m.triage.reasons },
    openUrl: "/inbox",
  }));
}

async function matchCards(u: User): Promise<Decision[]> {
  const out: Decision[] = [];
  for (const e of await encounters.list(u, { statuses: ["review", "processing"], clinicianId: u.id })) {
    if (e.patientId || !(await artifacts.get(e.id, "capture_origin"))) continue;
    const at = new Date(e.startedAt ?? e.scheduledAt).getTime();
    const around = await encounters.list(u, { clinicianId: u.id, from: new Date(at - 12 * 3600000).toISOString(), to: new Date(at + 12 * 3600000).toISOString() });
    const seen = new Set<string>();
    const candidates: { patientId: string; name: string; scheduledAt: string; encounterId: string }[] = [];
    for (const s of around.filter((x) => x.patientId && x.id !== e.id).sort((a, b) => Math.abs(new Date(a.scheduledAt).getTime() - at) - Math.abs(new Date(b.scheduledAt).getTime() - at))) {
      if (seen.has(s.patientId!)) continue;
      seen.add(s.patientId!);
      candidates.push({ patientId: s.patientId!, name: (await patientName(u, s.patientId)) ?? "Patient", scheduledAt: s.scheduledAt, encounterId: s.id });
      if (candidates.length >= 5) break;
    }
    out.push({
      id: `match:${e.id}`,
      kind: "patient.match",
      title: "Who was this visit with?",
      summary: `Recorded ${time(u, e.startedAt ?? e.scheduledAt)}${e.reason ? ` · ${e.reason}` : ""}`,
      safeLabel: `Match a recorded visit to a patient (${time(u, e.startedAt ?? e.scheduledAt)})`,
      encounterId: e.id,
      patientId: null,
      patientName: null,
      priority: 1,
      at: e.startedAt ?? e.scheduledAt,
      actions: [{ action: "approve", label: "This patient", needsScreen: true, payload: ["patientId"] }, snooze],
      detail: { candidates },
      openUrl: `/encounters/${e.id}`,
    });
  }
  return out;
}

async function taskCards(u: User): Promise<Decision[]> {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return (await tasks.forUser(u)).filter((t) => !t.dueAt || new Date(t.dueAt) <= end).map((t) => ({
    id: `task:${t.id}`,
    kind: "task.review" as const,
    title: t.title,
    summary: [t.patientName, t.detail].filter(Boolean).join(" · ").slice(0, 140),
    safeLabel: t.kind === "result_review" ? "Result to review" : "Task due",
    encounterId: t.encounterId,
    patientId: t.patientId,
    patientName: t.patientName,
    priority: t.dueAt && new Date(t.dueAt) < new Date() ? 1 : 3,
    at: t.dueAt ?? t.createdAt,
    actions: [{ action: "approve", label: "Done", needsScreen: true }, { action: "reject", label: "Dismiss", needsScreen: true }, snooze],
    detail: { taskKind: t.kind, dueAt: t.dueAt, evidence: t.evidence },
    openUrl: t.encounterId ? `/encounters/${t.encounterId}` : "/inbox",
  }));
}

async function claimCards(u: User): Promise<Decision[]> {
  const orgWide = ["owner", "admin", "coder"].includes(u.role);
  if (!orgWide && u.role !== "clinician") return [];
  const rows = await all<{ encounter_id: string; status: string; updated_at: string; patient_id: string | null; scheduled_at: string }>(
    `SELECT c.encounter_id, c.status, c.updated_at, e.patient_id, e.scheduled_at FROM claims c JOIN encounters e ON e.id = c.encounter_id WHERE e.org_id = ? AND c.status IN ('needs_review', 'on_hold', 'rejected', 'denied') ${orgWide ? "" : "AND e.user_id = ?"} ORDER BY c.updated_at LIMIT 25`,
    ...(orgWide ? [u.orgId] : [u.orgId, u.id]),
  );
  return Promise.all(rows.map(async (r) => ({
    id: `claim:${r.encounter_id}`,
    kind: "claim.exception" as const,
    title: `Claim ${r.status.replace("_", " ")}`,
    summary: (await patientName(u, r.patient_id)) ?? "Visit",
    safeLabel: "Claim needs attention",
    encounterId: r.encounter_id,
    patientId: r.patient_id,
    patientName: await patientName(u, r.patient_id),
    priority: r.status === "denied" || r.status === "rejected" ? 1 : 2,
    at: r.updated_at,
    actions: [snooze],
    detail: { status: r.status, openOnly: true },
    openUrl: "/revenue",
  })));
}

interface ProposalRow {
  id: string;
  org_id: string;
  user_id: string;
  kind: ProposalKind;
  encounter_id: string | null;
  payload: string;
  summary: string;
  source: string;
  status: string;
  created_at: string;
}

async function proposalCards(u: User): Promise<Decision[]> {
  const rows = await all<ProposalRow>("SELECT * FROM decision_proposals WHERE user_id = ? AND org_id = ? AND status = 'open' ORDER BY created_at", u.id, u.orgId);
  return Promise.all(rows.map(async (r) => {
    const p = JSON.parse(r.payload) as Record<string, unknown>;
    const enc = r.encounter_id ? await encounters.get(u, r.encounter_id) : undefined;
    return {
      id: `prop:${r.id}`,
      kind: "proposal" as const,
      proposalKind: r.kind,
      title: r.summary,
      summary: r.kind === "note.edit" ? "Proposed note change" : r.kind === "message.reply" ? "Proposed reply" : r.kind === "task.create" ? "Proposed task" : "Proposed diagnosis change",
      safeLabel: "Suggested change to review",
      encounterId: r.encounter_id,
      patientId: enc?.patientId ?? null,
      patientName: await patientName(u, enc?.patientId ?? null),
      priority: 2,
      at: r.created_at,
      actions: [{ action: "approve", label: "Apply", needsScreen: true }, { action: "reject", label: "Discard", needsScreen: true }, snooze],
      detail: { source: r.source, ...(r.kind === "note.edit" ? { diff: p.diff, reply: p.reply } : p) },
      openUrl: r.encounter_id ? `/encounters/${r.encounter_id}` : "/inbox",
    };
  }));
}

async function snoozed(u: User) {
  const rows = await all<{ decision_id: string }>("SELECT decision_id FROM decision_state WHERE user_id = ? AND snoozed_until > ?", u.id, now());
  return new Set(rows.map((r) => r.decision_id));
}

export async function listDecisions(u: User, opts: { includeSnoozed?: boolean; kinds?: DecisionKind[] } = {}): Promise<Decision[]> {
  const sources: [DecisionKind, (u: User) => Promise<Decision[]>][] = [
    ["note.sign", signCards],
    ["note.cosign", cosignCards],
    ["coding.query", queryCards],
    ["message.reply", messageCards],
    ["patient.match", matchCards],
    ["task.review", taskCards],
    ["claim.exception", claimCards],
    ["proposal", proposalCards],
  ];
  const lists = await Promise.all(sources.filter(([k]) => (!opts.kinds || opts.kinds.includes(k)) && (!isCore() || (CORE_DECISIONS as readonly string[]).includes(k))).map(([, f]) => f(u)));
  const hidden = opts.includeSnoozed ? new Set<string>() : await snoozed(u);
  return lists.flat().filter((d) => !hidden.has(d.id)).sort((a, b) => a.priority - b.priority || a.at.localeCompare(b.at));
}

export async function decisionCounts(u: User) {
  const list = await listDecisions(u);
  const byKind: Partial<Record<DecisionKind, number>> = {};
  for (const d of list) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
  return { total: list.length, urgent: list.filter((d) => d.priority === 0).length, byKind };
}

export async function getDecision(u: User, id: string) {
  return (await listDecisions(u, { includeSnoozed: true })).find((d) => d.id === id) ?? null;
}

function noteDiff(before: Note | undefined, after: Note) {
  const out: { key: string; title: string; before: string; after: string }[] = [];
  const text = (n: Note | undefined, key: string) => n?.sections.find((s) => s.key === key)?.sentences.filter((s) => !s.pending).map((s) => s.text).join("\n") ?? "";
  for (const s of after.sections) {
    const a = text(before, s.key);
    const b = text(after, s.key);
    if (a !== b) out.push({ key: s.key, title: s.title, before: a, after: b });
  }
  return out;
}

export async function proposeDecision(u: User, kind: ProposalKind, payload: Record<string, unknown>, opts: { source?: string; summary?: string } = {}) {
  let encounterId = typeof payload.encounterId === "string" ? payload.encounterId : null;
  let stored: Record<string, unknown>;
  let summary = opts.summary?.trim().slice(0, 140) ?? "";
  if (encounterId && !(await encounters.get(u, encounterId))) throw new Error("Encounter not found");
  if (kind === "note.edit") {
    const message = String(payload.message ?? "").trim();
    if (!encounterId || !message) throw new Invalid("Say which visit and what to change");
    const before = await notes.latest(encounterId);
    if (!before) throw new Invalid("This visit has no note yet");
    const r = await assist(u, encounterId, message.slice(0, 1000), { save: false });
    if (!r.note) throw new Invalid(r.reply || "That didn't produce a change to the note");
    const diff = noteDiff(before.content, r.note);
    if (!diff.length) throw new Invalid("That didn't change the note");
    stored = { message, baseHash: contentHash(before.content), note: r.note, diff, reply: r.reply };
    summary ||= `Edit note: ${message.slice(0, 100)}`;
  } else if (kind === "dx.add" || kind === "dx.remove") {
    const code = String(payload.code ?? "").trim().toUpperCase();
    if (!encounterId || !code) throw new Invalid("Say which visit and which code");
    stored = { code };
    summary ||= `${kind === "dx.add" ? "Add" : "Remove"} diagnosis ${code}`;
  } else if (kind === "task.create") {
    const title = String(payload.title ?? "").trim().slice(0, 140);
    if (!title) throw new Invalid("Give the task a title");
    const patientId = typeof payload.patientId === "string" ? payload.patientId : null;
    if (patientId && !(await patients.get(u, patientId))) throw new Error("Patient not found");
    stored = { title, detail: String(payload.detail ?? "").slice(0, 500), dueAt: typeof payload.dueAt === "string" ? payload.dueAt : null, patientId, taskKind: (payload.taskKind as TaskKind) ?? "other" };
    summary ||= title;
  } else if (kind === "message.reply") {
    const messageId = String(payload.messageId ?? "");
    const m = messageId ? await messages.get(u, messageId) : undefined;
    if (!m) throw new Error("Message not found");
    const text = String(payload.text ?? "").trim();
    if (text.length < 2) throw new Invalid("Write the reply to propose");
    stored = { messageId, text: text.slice(0, 4000) };
    encounterId = m.encounterId;
    summary ||= `Reply to ${m.patientName}`;
  } else {
    throw new Invalid("Unknown proposal kind");
  }
  const id = uid("prop_");
  await run("INSERT INTO decision_proposals (id, org_id, user_id, kind, encounter_id, payload, summary, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, u.id, kind, encounterId, JSON.stringify(stored), summary, (opts.source ?? "agent").slice(0, 30), now());
  await audit.log(u, encounterId, "decision.proposed", { id, kind, source: opts.source ?? "agent" });
  return `prop:${id}`;
}

async function applyProposal(u: User, row: ProposalRow): Promise<string> {
  const p = JSON.parse(row.payload) as Record<string, unknown>;
  if (row.kind === "note.edit") {
    const cur = await notes.latest(row.encounter_id!);
    if (!cur || contentHash(cur.content) !== p.baseHash) throw new Invalid("The note changed after this was proposed. Ask again.");
    await saveNoteEdits(u, row.encounter_id!, p.note as Note, "assistant");
    return "Note updated";
  }
  if (row.kind === "dx.add" || row.kind === "dx.remove") {
    await reviseDiagnoses(u, row.encounter_id!, { kind: row.kind === "dx.add" ? "add" : "remove", code: String(p.code) });
    return row.kind === "dx.add" ? "Diagnosis added" : "Diagnosis removed";
  }
  if (row.kind === "task.create") {
    await tasks.create({ orgId: u.orgId, encounterId: row.encounter_id, patientId: (p.patientId as string) ?? null, assigneeId: u.id, kind: (p.taskKind as TaskKind) ?? "other", key: `prop:${row.id}`, title: String(p.title), detail: String(p.detail ?? ""), dueAt: (p.dueAt as string) ?? null, source: "manual", createdBy: u.id });
    return "Task created";
  }
  await sendReply(u, String(p.messageId), { text: String(p.text) });
  return "Reply sent";
}

export async function actOnDecision(u: User, id: string, action: DecisionAction, payload: Record<string, unknown> = {}, ctx: { channel: DecisionChannel }): Promise<DecisionResult> {
  const [prefix, ref, extra] = id.split(":");
  if (!prefix || !ref) throw new Invalid("Unknown decision");
  const done = async (message: string, more: Partial<DecisionResult> = {}): Promise<DecisionResult> => {
    await audit.log(u, more.detail?.encounterId as string ?? null, "decision.acted", { id, action, channel: ctx.channel });
    return { ok: true, id, action, message, ...more };
  };
  if (action === "snooze") {
    const minutes = Math.min(Math.max(Math.round(Number(payload.minutes ?? 240)), 5), 7 * 24 * 60);
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    await run("INSERT INTO decision_state (user_id, decision_id, snoozed_until) VALUES (?, ?, ?) ON CONFLICT (user_id, decision_id) DO UPDATE SET snoozed_until = excluded.snoozed_until", u.id, id, until);
    return done(`Snoozed until ${time(u, until)}`);
  }
  if (action !== "draft" && !SCREEN.includes(ctx.channel)) throw new Forbidden("Open this on your screen to approve or reject it. Voice and text can only snooze or propose.");
  if (prefix === "sign") {
    const enc = await encounters.get(u, ref);
    if (!enc) throw new Error("Encounter not found");
    if (action === "reject") {
      const origin = await artifacts.get<{ channel?: string }>(ref, "capture_origin");
      if (!origin) throw new Invalid("Only quick captures can be deleted from the stack. Open the visit to change it.");
      if (enc.status === "signed") throw new Invalid("This note is signed. Add an addendum instead.");
      const originErr = (origin as { error?: string }).error;
      if (!(enc.status === "review" || (enc.status === "paused" && originErr))) throw new Invalid("This visit is still being recorded or written. Try again when the note is ready.");
      if ((await artifacts.get<{ scheduledVisit?: boolean }>(ref, "phone_call"))?.scheduledVisit) throw new Invalid("This was a scheduled visit. Open it to change or clear the note.");
      if (enc.userId !== u.id) throw new Forbidden("Only the clinician who recorded this visit can delete it");
      await deleteAudio(u, ref, "discarded_from_stack");
      await run("DELETE FROM encounters WHERE id = ?", ref);
      await audit.log(u, null, "capture.discarded", { encounterId: ref, channel: origin.channel ?? null });
      return done("Deleted. The recording and note are gone.", { detail: { encounterId: ref } });
    }
    if (action !== "approve") throw new Invalid("A note can be signed or snoozed");
    const rec = await notes.latest(ref);
    const reviewMs = Number(payload.reviewMs);
    if (ctx.channel === "stack" && !(reviewMs >= 0)) throw new Invalid("Send reviewMs from the review screen");
    const count = words(rec?.content);
    const fast = Number.isFinite(reviewMs) && reviewMs < FAST_REVIEW_MS && count > FAST_REVIEW_WORDS;
    const out = await signEncounter(u, ref, { force: payload.force === true });
    if (!out.signed) return { ok: false, id, action, message: "Fix these before signing", blockers: out.blockers };
    await artifacts.set(ref, "sign_review", { reviewMs: Number.isFinite(reviewMs) ? reviewMs : null, words: count, fast, channel: ctx.channel, at: now() });
    if (fast) await audit.log(u, ref, "sign.fast_review", { reviewMs, words: count });
    const summary = await sendQueuedSummary(u, ref);
    const base = fast ? "Signed. That was a fast review for a long note, so it's flagged for QA." : "Signed.";
    return done(summary ? `${base} ${summary}` : base, { detail: { encounterId: ref, fast } });
  }
  if (prefix === "cosign") {
    if (action === "approve") await cosignNote(u, ref, { attestation: payload.attestation as string | undefined, comment: payload.comment as string | undefined });
    else if (action === "reject") await returnNote(u, ref, String(payload.comment ?? ""));
    else throw new Invalid("Co-sign or return this note");
    return done(action === "approve" ? "Co-signed" : "Returned to the author", { detail: { encounterId: ref } });
  }
  if (prefix === "cdi") {
    if (action !== "approve" || !extra) throw new Invalid("Answer the query");
    const code = payload.code === null || payload.code === "" || payload.code === "undetermined" ? null : String(payload.code ?? "");
    if (code === "") throw new Invalid("Choose an answer");
    await reviseDiagnoses(u, ref, { kind: "answer", queryId: extra, code });
    return done("Query answered", { detail: { encounterId: ref } });
  }
  if (prefix === "msg") {
    if (action === "draft") {
      const m = await prepareDraft(u, ref);
      return done("Draft ready", { detail: { draft: m.draft } });
    }
    if (action === "approve") {
      await sendReply(u, ref, { text: typeof payload.text === "string" ? payload.text : undefined });
      return done("Reply sent");
    }
    await closeMessage(u, ref);
    return done("Message closed");
  }
  if (prefix === "match") {
    if (action !== "approve") throw new Invalid("Choose the patient");
    const enc = await encounters.get(u, ref);
    if (!enc) throw new Error("Encounter not found");
    if (enc.status === "signed") throw new Invalid("This visit is signed");
    const patientId = String(payload.patientId ?? "");
    if (!patientId || !(await patients.get(u, patientId))) throw new Error("Patient not found");
    await encounters.update(u, ref, { patientId });
    await audit.log(u, ref, "encounter.patient_matched", { patientId, channel: ctx.channel });
    return done("Visit matched to the patient", { detail: { encounterId: ref } });
  }
  if (prefix === "task") {
    const t = await tasks.get(u, ref);
    if (!t || t.assigneeId !== u.id) throw new Error("Task not found");
    await tasks.setStatus(u, ref, action === "approve" ? "done" : "dismissed");
    return done(action === "approve" ? "Done" : "Dismissed");
  }
  if (prefix === "claim") throw new Invalid("Open the revenue page to work this claim");
  if (prefix === "prop") {
    const row = await get<ProposalRow>("SELECT * FROM decision_proposals WHERE id = ? AND user_id = ? AND org_id = ?", ref, u.id, u.orgId);
    if (!row) throw new Error("Proposal not found");
    if (row.status !== "open") throw new Invalid("This suggestion was already handled");
    let message = "Discarded";
    if (action === "approve") message = await applyProposal(u, row);
    else if (action !== "reject") throw new Invalid("Apply or discard this suggestion");
    await run("UPDATE decision_proposals SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?", action === "approve" ? "applied" : "rejected", u.id, now(), ref);
    return done(message, { detail: { encounterId: row.encounter_id } });
  }
  throw new Invalid("Unknown decision");
}
