import { all, get, nextOrd, now, run, uid } from "../db";
import { draftReply, PLACEHOLDER, triageMessage, type Draft, type Triage } from "../engine/messages";
import { detectTasks, type TaskKind } from "../engine/tasks";
import type { PaPacket } from "../engine/priorauth";
import type { CodingResult, Encounter, Patient } from "../types";
import { Forbidden, Invalid } from "./policy";
import { artifacts, audit, encounters, j, notes, orders, patientFlags, patients, users, utterances, type User } from "./repo";
import { pendingCosigns } from "./signoff";

export interface Task {
  id: string;
  encounterId: string | null;
  patientId: string | null;
  patientName: string | null;
  messageId: string | null;
  assigneeId: string;
  kind: TaskKind;
  key: string;
  title: string;
  detail: string;
  dueAt: string | null;
  status: "open" | "done" | "dismissed";
  evidence: string[];
  source: "auto" | "manual" | "message";
  completedAt: string | null;
  createdAt: string;
}

interface TaskRow {
  id: string;
  encounter_id: string | null;
  patient_id: string | null;
  patient_name: string | null;
  message_id: string | null;
  assignee_id: string;
  kind: string;
  key: string;
  title: string;
  detail: string;
  due_at: string | null;
  status: string;
  evidence: string;
  source: string;
  completed_at: string | null;
  created_at: string;
}

const toTask = (r: TaskRow): Task => ({ id: r.id, encounterId: r.encounter_id, patientId: r.patient_id, patientName: r.patient_name, messageId: r.message_id, assigneeId: r.assignee_id, kind: r.kind as TaskKind, key: r.key, title: r.title, detail: r.detail, dueAt: r.due_at, status: r.status as Task["status"], evidence: j(r.evidence, []), source: r.source as Task["source"], completedAt: r.completed_at, createdAt: r.created_at });

const TASK_SELECT = "SELECT t.*, p.name AS patient_name FROM tasks t LEFT JOIN patients p ON p.id = t.patient_id";

export const tasks = {
  forEncounter: async (encId: string) => (await all<TaskRow>(`${TASK_SELECT} WHERE t.encounter_id = ? ORDER BY t.ord`, encId)).map(toTask),
  forUser: async (u: User, status: Task["status"] | "all" = "open") => (await all<TaskRow>(`${TASK_SELECT} WHERE t.org_id = ? AND t.assignee_id = ? ${status === "all" ? "" : "AND t.status = ?"} ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.ord`, ...(status === "all" ? [u.orgId, u.id] : [u.orgId, u.id, status]))).map(toTask),
  openOfKind: async (u: User, kind: TaskKind, orgWide: boolean) => (await all<TaskRow>(`${TASK_SELECT} WHERE t.org_id = ? AND t.kind = ? AND t.status = 'open' ${orgWide ? "" : "AND t.assignee_id = ?"} ORDER BY t.due_at`, ...(orgWide ? [u.orgId, kind] : [u.orgId, kind, u.id]))).map(toTask),
  forPatient: async (u: User, patientId: string) => (await all<TaskRow>(`${TASK_SELECT} WHERE t.org_id = ? AND t.patient_id = ? AND t.status = 'open' ORDER BY t.due_at`, u.orgId, patientId)).map(toTask),
  get: async (u: User, id: string) => {
    const r = await get<TaskRow>(`${TASK_SELECT} WHERE t.org_id = ? AND t.id = ?`, u.orgId, id);
    return r ? toTask(r) : undefined;
  },
  create: async (t: { orgId: string; encounterId?: string | null; patientId?: string | null; messageId?: string | null; assigneeId: string; kind: TaskKind; key: string; title: string; detail?: string; dueAt?: string | null; evidence?: string[]; source: Task["source"]; createdBy?: string | null }) => {
    const id = uid("tsk_");
    await run(
      "INSERT INTO tasks (id, org_id, encounter_id, patient_id, message_id, assignee_id, kind, key, title, detail, due_at, status, evidence, source, created_by, ord, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)",
      id, t.orgId, t.encounterId ?? null, t.patientId ?? null, t.messageId ?? null, t.assigneeId, t.kind, t.key, t.title, t.detail ?? "", t.dueAt ?? null, JSON.stringify(t.evidence ?? []), t.source, t.createdBy ?? null, nextOrd(), now(),
    );
    const { emit } = await import("./platform");
    await emit(t.orgId, "task.created", { taskId: id, kind: t.kind, title: t.title, encounterId: t.encounterId ?? null, patientId: t.patientId ?? null, dueAt: t.dueAt ?? null });
    return id;
  },
  setStatus: (u: User, id: string, status: Task["status"]) => run("UPDATE tasks SET status = ?, completed_by = ?, completed_at = ? WHERE org_id = ? AND id = ?", status, status === "open" ? null : u.id, status === "open" ? null : now(), u.orgId, id),
};

export async function syncTasks(user: User, enc: Encounter & { orgId?: string | null }) {
  const utts = await utterances.list(enc.id);
  const { extractFacts } = await import("../engine/extract");
  const patient = enc.patientId ? await patients.get(user, enc.patientId) : undefined;
  const facts = extractFacts(utts, patient?.chart, { pronouns: patient?.pronouns, sex: patient?.sex });
  const pa = (await artifacts.get<PaPacket[]>(enc.id, "priorAuth")) ?? [];
  const drafts = detectTasks(facts, await orders.list(enc.id), utts, { at: new Date(enc.scheduledAt), paServices: pa.filter((p) => !p.submission).map((p) => p.service) });
  const existing = await tasks.forEncounter(enc.id);
  for (const d of drafts) {
    const cur = existing.find((t) => t.key === d.key);
    if (!cur) await tasks.create({ orgId: enc.orgId ?? user.orgId, encounterId: enc.id, patientId: enc.patientId, assigneeId: enc.userId, kind: d.kind, key: d.key, title: d.title, detail: d.detail, dueAt: d.dueAt, evidence: d.evidence, source: "auto" });
    else if (cur.status === "open" && cur.source === "auto") await run("UPDATE tasks SET title = ?, detail = ?, due_at = ?, evidence = ? WHERE id = ?", d.title, d.detail, d.dueAt, JSON.stringify(d.evidence), cur.id);
  }
  for (const t of existing) if (t.source === "auto" && t.status === "open" && !drafts.some((d) => d.key === t.key)) await run("DELETE FROM tasks WHERE id = ?", t.id);
  return tasks.forEncounter(enc.id);
}

export interface Message {
  id: string;
  patientId: string;
  patientName: string;
  encounterId: string | null;
  assigneeId: string;
  assigneeName: string | null;
  subject: string;
  body: string;
  channel: "portal" | "visit_link" | "phone" | "manual";
  triage: Triage;
  status: "new" | "drafted" | "replied" | "closed";
  draft: string | null;
  draftMeta: (Omit<Draft, "text"> & { engine: "local" | "claude"; at: string }) | null;
  reply: string | null;
  repliedBy: string | null;
  repliedAt: string | null;
  receivedAt: string;
}

interface MessageRow {
  id: string;
  patient_id: string;
  patient_name: string;
  encounter_id: string | null;
  assignee_id: string;
  assignee_name: string | null;
  subject: string;
  body: string;
  channel: string;
  triage: string;
  status: string;
  draft: string | null;
  draft_meta: string | null;
  reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
  received_at: string;
}

const toMessage = (r: MessageRow): Message => ({ id: r.id, patientId: r.patient_id, patientName: r.patient_name, encounterId: r.encounter_id, assigneeId: r.assignee_id, assigneeName: r.assignee_name, subject: r.subject, body: r.body, channel: r.channel as Message["channel"], triage: j(r.triage, { urgency: "routine", intent: "other", reasons: [], lang: "en", meds: [], labs: [] }), status: r.status as Message["status"], draft: r.draft, draftMeta: r.draft_meta ? j(r.draft_meta, null) : null, reply: r.reply, repliedBy: r.replied_by, repliedAt: r.replied_at, receivedAt: r.received_at });

const MSG_SELECT = "SELECT m.*, p.name AS patient_name, u.name AS assignee_name FROM messages m JOIN patients p ON p.id = m.patient_id LEFT JOIN users u ON u.id = m.assignee_id";
const URGENCY_ORDER = "CASE WHEN m.status IN ('replied', 'closed') THEN 3 WHEN m.triage LIKE '%\"urgency\":\"emergency\"%' THEN 0 WHEN m.triage LIKE '%\"urgency\":\"same_day\"%' THEN 1 ELSE 2 END";

function msgScope(u: User) {
  return ["owner", "admin", "scribe"].includes(u.role) ? { sql: "m.org_id = ?", params: [u.orgId] } : { sql: "m.org_id = ? AND m.assignee_id = ?", params: [u.orgId, u.id] };
}

export const messages = {
  list: async (u: User, opts: { open?: boolean; mine?: boolean } = {}) => {
    const s = opts.mine ? { sql: "m.org_id = ? AND m.assignee_id = ?", params: [u.orgId, u.id] } : msgScope(u);
    return (await all<MessageRow>(`${MSG_SELECT} WHERE ${s.sql} ${opts.open ? "AND m.status IN ('new', 'drafted')" : ""} ORDER BY ${URGENCY_ORDER}, m.received_at DESC`, ...s.params)).map(toMessage);
  },
  get: async (u: User, id: string) => {
    const s = msgScope(u);
    const r = await get<MessageRow>(`${MSG_SELECT} WHERE ${s.sql} AND m.id = ?`, ...s.params, id);
    return r ? toMessage(r) : undefined;
  },
  forEncounterThread: async (encId: string, patientId: string) => (await all<MessageRow>(`${MSG_SELECT} WHERE m.patient_id = ? AND (m.encounter_id = ? OR m.channel = 'visit_link') ORDER BY m.received_at`, patientId, encId)).map(toMessage),
};

export async function lastVisitFor(u: User, patientId: string, before?: string) {
  const list = (await encounters.list(u, { patientId, statuses: ["signed"] })).filter((e) => !before || e.scheduledAt < before);
  const last = list.at(-1);
  if (last) {
    const rec = await notes.latest(last.id);
    const plan = (rec?.content.sections ?? []).filter((s) => /plan/i.test(s.key) || /plan/i.test(s.title)).flatMap((s) => s.sentences.filter((x) => !x.heading && !x.pending).map((x) => x.text.replace(/\.$/, ""))).slice(0, 4);
    return { date: last.scheduledAt, plan, encounterId: last.id };
  }
  const p = await patients.get(u, patientId);
  const pv = p?.chart.priorVisits?.[0];
  return pv ? { date: pv.date, plan: pv.plan.slice(0, 4), encounterId: null } : null;
}

async function buildDraft(u: User, m: Pick<Message, "body" | "triage" | "patientId" | "assigneeId">, patient: Patient, lang?: "en" | "es") {
  const clinician = (await users.byId(m.assigneeId)) ?? u;
  const lastVisit = await lastVisitFor(u, patient.id);
  const draft = draftReply(m.body, m.triage, { patientFirst: patient.name.split(" ")[0], clinician: clinician.name, chart: patient.chart, lastVisit, lang });
  let engine: "local" | "claude" = "local";
  const { llmEnabled } = await import("../llm");
  if (llmEnabled()) {
    try {
      const { polishReplyWithClaude } = await import("../llm");
      draft.text = await polishReplyWithClaude({ message: m.body, draft: draft.text, chart: patient.chart, lang: draft.lang });
      draft.placeholders = (draft.text.match(/\*\*\*/g) ?? []).length;
      engine = "claude";
    } catch {
      engine = "local";
    }
  }
  return { draft, engine };
}

export async function receiveMessage(input: { orgId: string; patient: Patient; assigneeId: string; body: string; subject?: string; channel: Message["channel"]; encounterId?: string | null; actor?: User | null }) {
  const body = input.body.trim();
  if (body.length < 2) throw new Invalid("Write a message");
  if (body.length > 4000) throw new Invalid("Messages are limited to 4,000 characters");
  const triage = triageMessage(body, input.patient.chart);
  const id = uid("msg_");
  const subject = (input.subject?.trim() || body.split(/[.?!\n]/)[0]).slice(0, 80);
  await run("INSERT INTO messages (id, org_id, patient_id, encounter_id, assignee_id, subject, body, channel, triage, status, ord, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)", id, input.orgId, input.patient.id, input.encounterId ?? null, input.assigneeId, subject, body, input.channel, JSON.stringify(triage), nextOrd(), now());
  if (triage.urgency !== "routine") {
    await tasks.create({ orgId: input.orgId, patientId: input.patient.id, messageId: id, assigneeId: input.assigneeId, kind: "callback", key: `msg:${id}`, title: `${triage.urgency === "emergency" ? "Call now" : "Call today"}: ${input.patient.name} (${triage.reasons.join(", ")})`, detail: body.slice(0, 240), dueAt: now(), source: "message" });
  }
  const { emit } = await import("./platform");
  await emit(input.orgId, "message.received", { messageId: id, patientId: input.patient.id, urgency: triage.urgency, intent: triage.intent });
  await audit.log(input.actor ?? { id: null, orgId: input.orgId }, input.encounterId ?? null, "message.received", { id, urgency: triage.urgency, intent: triage.intent, channel: input.channel });
  return id;
}

export async function prepareDraft(u: User, id: string, opts: { lang?: "en" | "es" } = {}) {
  const m = await messages.get(u, id);
  if (!m) throw new Error("Message not found");
  if (m.status === "replied" || m.status === "closed") throw new Invalid("This message was already answered");
  const patient = (await patients.get(u, m.patientId))!;
  const { draft, engine } = await buildDraft(u, m, patient, opts.lang);
  const { text, ...meta } = draft;
  await run("UPDATE messages SET draft = ?, draft_meta = ?, status = 'drafted' WHERE id = ?", text, JSON.stringify({ ...meta, engine, at: now() }), id);
  await audit.log(u, m.encounterId, "message.drafted", { id, engine, placeholders: draft.placeholders });
  return (await messages.get(u, id))!;
}

export async function sendReply(u: User, id: string, input: { text?: string; actions?: string[] }) {
  const m = await messages.get(u, id);
  if (!m) throw new Error("Message not found");
  if (!["owner", "admin", "clinician"].includes(u.role) || (m.assigneeId !== u.id && !["owner", "admin"].includes(u.role))) throw new Forbidden(`Only ${m.assigneeName ?? "the assigned clinician"} can send this reply.`);
  if (m.status === "replied" || m.status === "closed") throw new Invalid("This message was already answered");
  const text = (input.text ?? m.draft ?? "").trim();
  if (text.length < 2) throw new Invalid("Write a reply");
  if (text.includes(PLACEHOLDER)) throw new Invalid(`Replace every ${PLACEHOLDER} with your own words before sending`);
  await run("UPDATE messages SET reply = ?, replied_by = ?, replied_at = ?, status = 'replied' WHERE id = ?", text, u.id, now(), id);
  const draftUsed = !!m.draft;
  const edit = m.draft ? editRatio(m.draft, text) : null;
  const allowed = new Set((m.draftMeta?.actions ?? []).map((a) => a.title));
  for (const title of input.actions ?? []) {
    if (!allowed.has(title)) continue;
    const kind = (m.draftMeta?.actions.find((a) => a.title === title)?.kind ?? "other") as string;
    await tasks.create({ orgId: u.orgId, patientId: m.patientId, messageId: id, assigneeId: m.assigneeId, kind: (kind === "appointment" ? "follow_up" : kind === "billing" ? "other" : kind) as TaskKind, key: `msg:${id}:${title}`, title, detail: `From ${m.patientName}'s message: "${m.subject}"`, dueAt: new Date(Date.now() + 86400000).toISOString(), source: "message", createdBy: u.id });
  }
  await audit.log(u, m.encounterId, "message.replied", { id, draftUsed, editRatio: edit, chars: text.length });
  if (m.channel === "visit_link" && m.encounterId) {
    const share = await artifacts.get<{ token: string }>(m.encounterId, "share");
    const base = process.env.CHARTSIDE_PUBLIC_URL?.replace(/\/$/, "");
    if (share && base) {
      const { notifyPatient } = await import("./notify");
      await notifyPatient(u, { orgId: u.orgId, patientId: m.patientId, encounterId: m.encounterId, kind: "reply", url: `${base}/s/${share.token}` }).catch(() => undefined);
    }
  }
  return (await messages.get(u, id))!;
}

export async function closeMessage(u: User, id: string) {
  const m = await messages.get(u, id);
  if (!m) throw new Error("Message not found");
  await run("UPDATE messages SET status = 'closed' WHERE id = ?", id);
  await audit.log(u, m.encounterId, "message.closed", { id });
  return (await messages.get(u, id))!;
}

function editRatio(a: string, b: string) {
  if (a === b) return 0;
  const wa = a.split(/\s+/);
  const wb = new Set(b.split(/\s+/));
  return Math.round((1 - wa.filter((w) => wb.has(w)).length / Math.max(wa.length, b.split(/\s+/).length)) * 1000) / 1000;
}

export async function messageContext(u: User, m: Message) {
  const p = await patients.get(u, m.patientId);
  if (!p) return null;
  return {
    patient: { id: p.id, name: p.name, dob: p.dob, sex: p.sex, mrn: p.mrn, language: p.language },
    problems: p.chart.problems,
    medications: p.chart.medications,
    allergies: p.chart.allergies,
    labs: [...(p.chart.labs ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    lastVisit: await lastVisitFor(u, p.id),
    openTasks: await tasks.forPatient(u, p.id),
    history: (await all<MessageRow>(`${MSG_SELECT} WHERE m.org_id = ? AND m.patient_id = ? AND m.id <> ? ORDER BY m.received_at DESC LIMIT 5`, u.orgId, p.id, m.id)).map(toMessage).map((x) => ({ id: x.id, subject: x.subject, status: x.status, receivedAt: x.receivedAt })),
  };
}

export async function inboxFor(u: User) {
  const [msgs, open, cosigns, drafts] = await Promise.all([
    messages.list(u, { open: true, mine: ["clinician", "owner", "admin"].includes(u.role) }),
    tasks.forUser(u),
    pendingCosigns(u),
    encounters.list(u, { statuses: ["review"], clinicianId: u.id }),
  ]);
  const queries: { encounterId: string; patientName: string | null; code: string; question: string }[] = [];
  const flags: { encounterId: string; patientName: string | null; item: string; comment: string; createdAt: string }[] = [];
  const mine = await encounters.list(u, { clinicianId: u.id, from: new Date(Date.now() - 45 * 86400000).toISOString() });
  const names = new Map<string, string | null>();
  const nameOf = async (e: Encounter) => {
    if (!names.has(e.id)) names.set(e.id, e.patientId ? (await patients.get(u, e.patientId))?.name ?? null : null);
    return names.get(e.id)!;
  };
  for (const e of mine) {
    if (e.status === "review") {
      const coding = await artifacts.get<CodingResult>(e.id, "coding");
      for (const d of coding?.dxDetail ?? []) if (d.query && !d.query.answer) queries.push({ encounterId: e.id, patientName: await nameOf(e), code: d.code, question: d.query.question });
    }
    for (const f of await patientFlags.list(e.id)) if (!f.resolved) flags.push({ encounterId: e.id, patientName: await nameOf(e), item: f.item, comment: f.comment, createdAt: f.created_at });
  }
  const unsigned = await Promise.all(drafts.map(async (e) => ({ encounterId: e.id, patientName: await nameOf(e), scheduledAt: e.scheduledAt, reason: e.reason, cosign: (await artifacts.get<{ status: string; comment?: string }>(e.id, "cosign")) ?? null })));
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const due = open.filter((t) => t.dueAt && new Date(t.dueAt) <= today);
  return {
    counts: { messages: msgs.length, urgent: msgs.filter((m) => m.triage.urgency !== "routine").length, tasks: open.length, due: due.length, cosign: cosigns.length, unsigned: unsigned.length, queries: queries.length, flags: flags.length },
    messages: msgs,
    tasks: open,
    cosigns: await Promise.all(cosigns.map(async (c) => ({ ...c, patientName: await nameOf((await encounters.get(u, c.encounterId))!) }))),
    unsigned,
    queries,
    flags,
  };
}

export async function inboxCount(u: User) {
  const [m, t] = await Promise.all([
    get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE org_id = ? AND assignee_id = ? AND status IN ('new', 'drafted')", u.orgId, u.id),
    get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND assignee_id = ? AND status = 'open' AND due_at <= ?", u.orgId, u.id, new Date(new Date().setHours(23, 59, 59, 999)).toISOString()),
  ]);
  const c = (await pendingCosigns(u)).length;
  return Number(m?.n ?? 0) + Number(t?.n ?? 0) + c;
}
