import { all, get, now, run, uid } from "../db";
import { addBusinessDays, MED_REC, tcmCode, type TcmResult } from "../engine/tcm";
import type { CodingResult, Encounter, Utterance } from "../types";
import { tasks } from "./inbox";
import { Invalid } from "./policy";
import { audit, patients, type User } from "./repo";

interface Row {
  id: string;
  patient_id: string;
  admission_id: string | null;
  clinician_id: string;
  discharge_at: string;
  contact_at: string | null;
  first_attempt_at: string | null;
  attempts: number;
  visit_encounter_id: string | null;
  code: string | null;
  status: string;
}

export interface TcmEpisode {
  id: string;
  patientId: string;
  admissionId: string | null;
  dischargeAt: string;
  contactAt: string | null;
  attempts: number;
  contactDue: string;
  visitDue7: string;
  visitDue14: string;
  visitEncounterId: string | null;
  code: string | null;
  status: "open" | "billed" | "closed";
}

const toEp = (r: Row): TcmEpisode => {
  const dc = new Date(r.discharge_at);
  const plus = (n: number) => new Date(dc.getTime() + n * 86400000).toISOString().slice(0, 10);
  return { id: r.id, patientId: r.patient_id, admissionId: r.admission_id, dischargeAt: r.discharge_at, contactAt: r.contact_at, attempts: Number(r.attempts), contactDue: addBusinessDays(dc, 2).toISOString(), visitDue7: plus(7), visitDue14: plus(14), visitEncounterId: r.visit_encounter_id, code: r.code, status: r.status as TcmEpisode["status"] };
};

export async function startTcm(u: User, input: { patientId: string; admissionId?: string | null; clinicianId: string; dischargeAt: string }) {
  const id = uid("tcm_");
  await run("INSERT INTO tcm_episodes (id, org_id, patient_id, admission_id, clinician_id, discharge_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)", id, u.orgId, input.patientId, input.admissionId ?? null, input.clinicianId, input.dischargeAt, now());
  const p = await patients.get(u, input.patientId);
  const dc = new Date(input.dischargeAt);
  await tasks.create({ orgId: u.orgId, patientId: input.patientId, assigneeId: input.clinicianId, kind: "callback", key: `tcm:contact:${id}`, title: `TCM: call ${p?.name ?? "the patient"} within 2 business days of discharge`, detail: "Interactive contact (phone, portal, or in person) is required for transitional care management. Log each attempt on the patient page.", dueAt: addBusinessDays(dc, 2).toISOString(), source: "auto" });
  await tasks.create({ orgId: u.orgId, patientId: input.patientId, assigneeId: input.clinicianId, kind: "follow_up", key: `tcm:visit:${id}`, title: `TCM: post-discharge visit for ${p?.name ?? "the patient"} within 7 days (high complexity) or 14 days`, detail: "Reconcile medications at or before the visit.", dueAt: new Date(dc.getTime() + 7 * 86400000).toISOString(), source: "auto" });
  await audit.log(u, null, "tcm.started", { id, patientId: input.patientId, admissionId: input.admissionId });
  return id;
}

export async function tcmForPatient(u: User, patientId: string) {
  return (await all<Row>("SELECT * FROM tcm_episodes WHERE org_id = ? AND patient_id = ? ORDER BY discharge_at DESC", u.orgId, patientId)).map(toEp);
}

export async function recordContact(u: User, id: string, outcome: "reached" | "attempt", at = now()) {
  const r = await get<Row>("SELECT * FROM tcm_episodes WHERE org_id = ? AND id = ?", u.orgId, id);
  if (!r) throw new Error("Episode not found");
  if (r.contact_at) throw new Invalid("Contact is already recorded");
  await run("UPDATE tcm_episodes SET attempts = attempts + 1, first_attempt_at = COALESCE(first_attempt_at, ?), contact_at = ? WHERE id = ?", at, outcome === "reached" ? at : null, id);
  const attempts = Number(r.attempts) + 1;
  if (outcome === "reached" || attempts >= 2) {
    for (const t of await tasks.forPatient(u, r.patient_id)) if (t.key === `tcm:contact:${id}`) await tasks.setStatus(u, t.id, "done");
  }
  await audit.log(u, null, "tcm.contact", { id, outcome, attempts });
  return toEp((await get<Row>("SELECT * FROM tcm_episodes WHERE id = ?", id))!);
}

export async function tcmForVisit(u: User, enc: Encounter, utts: Utterance[], mdm: CodingResult["em"]["level"]): Promise<(TcmResult & { episodeId: string }) | null> {
  if (!enc.patientId || enc.admissionId || enc.visitType === "ed" || enc.visitType === "group") return null;
  const visit = new Date(enc.scheduledAt);
  const since = new Date(visit.getTime() - 30 * 86400000).toISOString();
  const r = await get<Row>("SELECT * FROM tcm_episodes WHERE org_id = ? AND patient_id = ? AND discharge_at >= ? AND discharge_at < ? AND (status = 'open' OR visit_encounter_id = ?) ORDER BY discharge_at DESC LIMIT 1", u.orgId, enc.patientId, since, enc.scheduledAt, enc.id);
  if (!r) return null;
  const res = tcmCode({ dischargeAt: r.discharge_at, contactAt: r.contact_at, attempts: Number(r.attempts), firstAttemptAt: r.first_attempt_at, visitAt: enc.scheduledAt, mdm, medRec: utts.some((x) => x.speaker === "clinician" && MED_REC.test(x.text)) });
  return { ...res, episodeId: r.id };
}

export async function onTcmSigned(u: User, encId: string, tcm: { code: string | null; episodeId: string } | undefined) {
  if (!tcm?.code) return;
  await run("UPDATE tcm_episodes SET status = 'billed', code = ?, visit_encounter_id = ? WHERE id = ? AND org_id = ?", tcm.code, encId, tcm.episodeId, u.orgId);
  const ep = await get<Row>("SELECT * FROM tcm_episodes WHERE id = ?", tcm.episodeId);
  if (ep) for (const t of await tasks.forPatient(u, ep.patient_id)) if (t.key === `tcm:visit:${tcm.episodeId}`) await tasks.setStatus(u, t.id, "done");
  await audit.log(u, encId, "tcm.billed", { episodeId: tcm.episodeId, code: tcm.code });
}
