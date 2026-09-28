import { randomBytes } from "node:crypto";
import { all, get, jsonText } from "../db";
import { buildCheckin, scoreCheckin, type CheckinQuestion } from "../engine/checkin";
import { receiveMessage } from "./inbox";
import { notifyPatient } from "./notify";
import { assertCan, Invalid } from "./policy";
import { factsFor } from "./pipeline";
import { artifacts, audit, encounters, orgs, patients, users, type User } from "./repo";

export interface CheckinRecord {
  token: string;
  sendAt: string;
  sentAt?: string;
  sendStatus?: string;
  questions: CheckinQuestion[];
  answers?: Record<string, string>;
  submittedAt?: string;
  flags?: { level: string; text: string }[];
}

export async function scheduleCheckin(u: User, encId: string, days = 3, origin?: string) {
  assertCan(u, "clinical.edit");
  const enc = await encounters.get(u, encId);
  if (!enc?.patientId) throw new Invalid("Attach a patient first");
  if (enc.status !== "signed") throw new Invalid("Sign the note before scheduling a check-in");
  const cur = await artifacts.get<CheckinRecord>(encId, "checkin");
  if (cur && !cur.sentAt) throw new Invalid("A check-in is already scheduled");
  if (cur?.submittedAt) throw new Invalid("The patient already answered a check-in for this visit");
  const { facts } = await factsFor(u, enc);
  const rec: CheckinRecord = { token: randomBytes(16).toString("hex"), sendAt: new Date(Date.now() + Math.max(0, Math.min(30, days)) * 86400000).toISOString(), questions: buildCheckin(facts) };
  await artifacts.set(encId, "checkin", rec);
  await audit.log(u, encId, "checkin.scheduled", { days });
  if (days === 0 && origin) await dispatchDue(u.orgId, origin);
  return (await artifacts.get<CheckinRecord>(encId, "checkin"))!;
}

export async function dispatchDue(orgId: string, origin: string) {
  const rows = await all<{ encounter_id: string; content: string }>(`SELECT a.encounter_id, a.content FROM artifacts a JOIN encounters e ON e.id = a.encounter_id WHERE e.org_id = ? AND a.kind = 'checkin' AND ${jsonText("a.content", "sentAt")} IS NULL`, orgId);
  let sent = 0;
  for (const r of rows) {
    const rec = JSON.parse(r.content) as CheckinRecord;
    if (rec.sendAt > new Date().toISOString()) continue;
    const enc = await encounters.byIdUnscoped(r.encounter_id);
    if (!enc?.patientId) continue;
    const res = await notifyPatient(null, { orgId, patientId: enc.patientId, encounterId: enc.id, kind: "checkin", url: `${origin.replace(/\/$/, "")}/c/${rec.token}` }).catch((e: Error) => ({ status: "failed", error: e.message }));
    await artifacts.set(enc.id, "checkin", { ...rec, sentAt: new Date().toISOString(), sendStatus: res.status });
    sent++;
  }
  return sent;
}

async function byToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const r = await get<{ encounter_id: string }>(`SELECT encounter_id FROM artifacts WHERE kind = 'checkin' AND ${jsonText("content", "token")} = ?`, token);
  if (!r) return null;
  const enc = await encounters.byIdUnscoped(r.encounter_id);
  const rec = await artifacts.get<CheckinRecord>(r.encounter_id, "checkin");
  const patient = enc?.patientId ? await patients.byIdUnscoped(enc.patientId) : undefined;
  return enc && rec && patient ? { enc, rec, patient } : null;
}

export async function publicCheckin(token: string) {
  const x = await byToken(token);
  if (!x) return null;
  const clin = await users.byId(x.enc.userId);
  const org = x.enc.orgId ? await orgs.get(x.enc.orgId) : undefined;
  return { first: x.patient.name.split(" ")[0], clinician: clin?.name ?? "your clinician", org: org?.name ?? "", lang: (x.patient.language === "es" ? "es" : "en") as "es" | "en", questions: x.rec.questions, submitted: !!x.rec.submittedAt };
}

export async function submitCheckin(token: string, raw: Record<string, unknown>) {
  const x = await byToken(token);
  if (!x) throw new Invalid("This link is no longer valid");
  if (x.rec.submittedAt) throw new Invalid("Thanks, we already have your answers.");
  const answers: Record<string, string> = {};
  for (const q of x.rec.questions) {
    const v = raw[q.key];
    if (typeof v !== "string" || !v.trim()) continue;
    if (q.free) answers[q.key] = v.trim().slice(0, 1000);
    else if (q.options?.some((o) => o.value === v)) answers[q.key] = v;
  }
  if (!answers.overall) throw new Invalid("Tell us how you're feeling");
  const { flags, summary } = scoreCheckin(x.rec.questions, answers);
  await artifacts.set(x.enc.id, "checkin", { ...x.rec, answers, submittedAt: new Date().toISOString(), flags });
  const body = `Post-visit check-in${flags.length ? ` (${flags.map((f) => f.text).join("; ")})` : ""}:\n${summary}`;
  await receiveMessage({ orgId: x.enc.orgId!, patient: x.patient, assigneeId: x.enc.userId, body, subject: flags.some((f) => f.level !== "routine") ? "Check-in: needs attention" : "Check-in", channel: "portal", encounterId: x.enc.id });
  await audit.log(null, x.enc.id, "checkin.submitted", { flags: flags.length });
  return { flags };
}
