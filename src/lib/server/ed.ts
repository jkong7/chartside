import { all, get, now, run, uid } from "../db";
import { edDispositionOf } from "../engine/ed";
import { ageFrom } from "../engine/text";
import { admit } from "./inpatient";
import { Forbidden, Invalid } from "./policy";
import { audit, encounters, orgs, patients, utterances, type User } from "./repo";

export type EdStatus = "waiting" | "roomed" | "seen" | "dispo" | "departed" | "lwbs";

export interface EdVisit {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  age: number;
  sex: string;
  encounterId: string | null;
  providerId: string | null;
  providerName: string | null;
  status: EdStatus;
  esi: number;
  complaint: string;
  bed: string;
  arrivedAt: string;
  roomedAt: string | null;
  seenAt: string | null;
  disposition: string | null;
  dispoAt: string | null;
  departedAt: string | null;
  admissionId: string | null;
}

interface Row {
  id: string;
  patient_id: string;
  patient_name: string;
  mrn: string;
  dob: string;
  sex: string;
  encounter_id: string | null;
  provider_id: string | null;
  provider_name: string | null;
  status: string;
  esi: number;
  complaint: string;
  bed: string;
  arrived_at: string;
  roomed_at: string | null;
  seen_at: string | null;
  disposition: string | null;
  dispo_at: string | null;
  departed_at: string | null;
  admission_id: string | null;
}

export const DISPOSITIONS = ["Discharge home", "Admit", "Observation", "Transfer", "Left against medical advice"] as const;

const SELECT = "SELECT v.*, p.name AS patient_name, p.mrn, p.dob, p.sex, u.name AS provider_name FROM ed_visits v JOIN patients p ON p.id = v.patient_id LEFT JOIN users u ON u.id = v.provider_id";

const toVisit = (r: Row): EdVisit => ({ id: r.id, patientId: r.patient_id, patientName: r.patient_name, mrn: r.mrn, age: ageFrom(r.dob), sex: r.sex, encounterId: r.encounter_id, providerId: r.provider_id, providerName: r.provider_name, status: r.status as EdStatus, esi: Number(r.esi), complaint: r.complaint, bed: r.bed, arrivedAt: r.arrived_at, roomedAt: r.roomed_at, seenAt: r.seen_at, disposition: r.disposition, dispoAt: r.dispo_at, departedAt: r.departed_at, admissionId: r.admission_id });

export const edVisits = {
  active: async (u: User) => (await all<Row>(`${SELECT} WHERE v.org_id = ? AND v.status NOT IN ('departed', 'lwbs') ORDER BY v.esi, v.arrived_at`, u.orgId)).map(toVisit),
  since: async (u: User, since: string) => (await all<Row>(`${SELECT} WHERE v.org_id = ? AND v.arrived_at >= ? ORDER BY v.arrived_at`, u.orgId, since)).map(toVisit),
  get: async (u: User, id: string) => {
    const r = await get<Row>(`${SELECT} WHERE v.org_id = ? AND v.id = ?`, u.orgId, id);
    return r ? toVisit(r) : undefined;
  },
};

function assertEd(u: User) {
  if (!["owner", "admin", "clinician", "nurse", "scribe"].includes(u.role)) throw new Forbidden("Your role can view the board but not update it");
}

function assertProvider(u: User) {
  if (!["owner", "admin", "clinician"].includes(u.role)) throw new Forbidden("Only a provider can pick up a patient");
}

function nextMrn() {
  return `ED${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

export async function arrive(u: User, input: { patientId?: string; name?: string; dob?: string; sex?: string; complaint?: string; esi?: number; bed?: string; arrivedAt?: string }) {
  assertEd(u);
  const complaint = (input.complaint ?? "").trim();
  if (!complaint) throw new Invalid("Enter the chief complaint");
  const esi = Number(input.esi ?? 3);
  if (!Number.isInteger(esi) || esi < 1 || esi > 5) throw new Invalid("ESI must be 1 to 5");
  let patient = input.patientId ? await patients.get(u, input.patientId) : undefined;
  if (input.patientId && !patient) throw new Invalid("Patient not found");
  if (!patient) {
    const name = (input.name ?? "").trim();
    if (!name) throw new Invalid("Choose a patient or enter a name");
    if (!input.dob || !/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) throw new Invalid("Enter a date of birth");
    patient = await patients.create(u, { mrn: nextMrn(), name: name.slice(0, 80), dob: input.dob, sex: input.sex === "F" || input.sex === "M" ? input.sex : "X", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
  }
  if ((await edVisits.active(u)).some((v) => v.patientId === patient!.id)) throw new Invalid(`${patient.name} is already on the board`);
  const id = uid("edv_");
  const bed = (input.bed ?? "").trim().slice(0, 20);
  const at = input.arrivedAt ?? now();
  await run("INSERT INTO ed_visits (id, org_id, patient_id, status, esi, complaint, bed, arrived_at, roomed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, patient.id, bed ? "roomed" : "waiting", esi, complaint.slice(0, 120), bed, at, bed ? at : null, now());
  await audit.log(u, null, "ed.arrived", { visitId: id, esi });
  return (await edVisits.get(u, id))!;
}

async function load(u: User, id: string) {
  const v = await edVisits.get(u, id);
  if (!v) throw new Error("ED visit not found");
  if (v.status === "departed" || v.status === "lwbs") throw new Invalid("This patient has left the department");
  return v;
}

export async function assignBed(u: User, id: string, bed: string) {
  assertEd(u);
  const v = await load(u, id);
  const b = bed.trim().slice(0, 20);
  if (!b) throw new Invalid("Enter a bed");
  if ((await edVisits.active(u)).some((x) => x.id !== id && x.bed.toLowerCase() === b.toLowerCase())) throw new Invalid(`Bed ${b} is occupied`);
  await run("UPDATE ed_visits SET bed = ?, status = ?, roomed_at = COALESCE(roomed_at, ?) WHERE id = ?", b, v.status === "waiting" ? "roomed" : v.status, now(), id);
  return (await edVisits.get(u, id))!;
}

export async function pickUp(u: User, id: string, at = now()) {
  assertProvider(u);
  const v = await load(u, id);
  if (v.encounterId) {
    if (v.providerId !== u.id) {
      await run("UPDATE ed_visits SET provider_id = ? WHERE id = ?", u.id, id);
      await run("UPDATE encounters SET user_id = ? WHERE id = ? AND org_id = ? AND status <> 'signed'", u.id, v.encounterId, u.orgId);
      await audit.log(u, v.encounterId, "ed.handed_off", { visitId: id, from: v.providerId });
    }
    return v.encounterId;
  }
  const enc = await encounters.create(u, { clinicianId: u.id, patientId: v.patientId, scheduledAt: v.arrivedAt, visitType: "ed", reason: v.complaint, templateId: "ed_note", setting: "ed" });
  await encounters.update(u, enc.id, { startedAt: at });
  await run("UPDATE ed_visits SET provider_id = ?, encounter_id = ?, status = CASE WHEN status IN ('waiting', 'roomed') THEN 'seen' ELSE status END, seen_at = ? WHERE id = ?", u.id, enc.id, at, id);
  await audit.log(u, enc.id, "ed.picked_up", { visitId: id });
  return enc.id;
}

export async function setDisposition(u: User, id: string, disposition: string) {
  assertEd(u);
  const v = await load(u, id);
  if (!(DISPOSITIONS as readonly string[]).includes(disposition)) throw new Invalid("Choose a disposition");
  if (!v.encounterId) throw new Invalid("A provider has not seen this patient yet");
  await run("UPDATE ed_visits SET disposition = ?, dispo_at = ?, status = 'dispo' WHERE id = ?", disposition, now(), id);
  await audit.log(u, v.encounterId, "ed.disposition", { visitId: id, disposition });
  return (await edVisits.get(u, id))!;
}

export async function admitFromEd(u: User, id: string, input: { unit?: string; room?: string; attendingId?: string }) {
  assertProvider(u);
  const v = await load(u, id);
  if (v.admissionId) throw new Invalid("Already admitted");
  const d = v.disposition ?? (v.encounterId ? edDispositionOf(await utterances.list(v.encounterId)) : null);
  const reason = `${d === "Observation" ? "Observation for " : ""}${v.complaint.toLowerCase()}`;
  const res = await admit(u, { patientId: v.patientId, unit: input.unit, room: input.room, reason, attendingId: input.attendingId });
  await run("UPDATE ed_visits SET admission_id = ?, disposition = COALESCE(disposition, ?), dispo_at = COALESCE(dispo_at, ?), status = 'dispo' WHERE id = ?", res.admission.id, d === "Observation" ? "Observation" : "Admit", now(), id);
  return res;
}

export async function depart(u: User, id: string, lwbs = false) {
  assertEd(u);
  const v = await load(u, id);
  if (lwbs && v.encounterId) throw new Invalid("A provider has already seen this patient; record a disposition instead");
  if (!lwbs && !v.disposition) throw new Invalid("Record a disposition before the patient departs");
  await run("UPDATE ed_visits SET status = ?, departed_at = ?, bed = '' WHERE id = ?", lwbs ? "lwbs" : "departed", now(), id);
  await audit.log(u, v.encounterId, lwbs ? "ed.lwbs" : "ed.departed", { visitId: id });
  return (await edVisits.get(u, id))!;
}

const minutes = (a: string, b: string | Date) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export async function edBoard(u: User, at = new Date()) {
  const active = await edVisits.active(u);
  const rows = await Promise.all(active.map(async (v) => {
    const enc = v.encounterId ? await encounters.get(u, v.encounterId) : undefined;
    const suggested = !v.disposition && v.encounterId ? edDispositionOf(await utterances.list(v.encounterId)) : null;
    const los = minutes(v.arrivedAt, at);
    const flags: string[] = [];
    if (v.esi <= 2 && !v.seenAt && minutes(v.arrivedAt, at) >= 10) flags.push(`ESI ${v.esi} not seen in ${minutes(v.arrivedAt, at)} min`);
    if (!v.seenAt && minutes(v.arrivedAt, at) >= 60) flags.push("Waiting over an hour");
    if (los >= 240) flags.push(`Length of stay ${Math.floor(los / 60)}h ${los % 60}m`);
    if (v.status === "dispo" && v.dispoAt && minutes(v.dispoAt, at) >= 120 && /Admit|Observation/.test(v.disposition ?? "")) flags.push("Boarding over 2 hours");
    return { ...v, losMinutes: los, noteStatus: enc?.status ?? null, suggestedDisposition: suggested, flags };
  }));
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  const today = await edVisits.since(u, start.toISOString());
  const d2p = today.filter((v) => v.seenAt).map((v) => minutes(v.arrivedAt, v.seenAt!));
  const done = today.filter((v) => v.status === "departed" && v.departedAt);
  return {
    rows,
    metrics: {
      arrivals: today.length,
      inDepartment: active.length,
      waiting: active.filter((v) => !v.seenAt).length,
      doorToProvider: median(d2p),
      medianLos: median(done.map((v) => minutes(v.arrivedAt, v.departedAt!))),
      lwbs: today.filter((v) => v.status === "lwbs").length,
      admitRate: done.length ? Math.round((done.filter((v) => /Admit|Observation|Transfer/.test(v.disposition ?? "")).length / done.length) * 100) : null,
    },
  };
}

export async function edProviders(u: User) {
  return (await orgs.members(u.orgId)).filter((m) => m.status === "active" && ["owner", "admin", "clinician"].includes(m.role)).map((m) => ({ id: m.userId, name: m.name }));
}
