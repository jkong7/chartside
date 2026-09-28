import { all, get, now, run, uid } from "../db";
import type { Facts } from "../engine/extract";
import { carryForward, dischargeMedRec, dischargeSections, hospitalCourse, intervalChanges, pendingResults, snapshotFrom, type CourseDay, type Snapshot } from "../engine/inpatient";
import { ageFrom, pronounsFor, toThirdPerson } from "../engine/text";
import type { Encounter, Note, Patient } from "../types";
import { Forbidden, Invalid } from "./policy";
import { artifacts, audit, encounters, j, notes, orders, patients, users, utterances, type EncounterWithClinician, type User } from "./repo";

export interface Handoff {
  severity: "stable" | "watcher" | "unstable";
  summary: string;
  actions: string[];
  awareness: string;
  synthesis: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Admission {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  dob: string;
  sex: string;
  attendingId: string;
  attendingName: string | null;
  status: "active" | "discharged";
  unit: string;
  room: string;
  reason: string;
  admitAt: string;
  dischargeAt: string | null;
  handoff: Handoff | null;
}

interface Row {
  id: string;
  patient_id: string;
  patient_name: string;
  mrn: string;
  dob: string;
  sex: string;
  attending_id: string;
  attending_name: string | null;
  status: string;
  unit: string;
  room: string;
  reason: string;
  admit_at: string;
  discharge_at: string | null;
  handoff: string;
}

const toAdmission = (r: Row): Admission => {
  const h = j<Partial<Handoff>>(r.handoff, {});
  return { id: r.id, patientId: r.patient_id, patientName: r.patient_name, mrn: r.mrn, dob: r.dob, sex: r.sex, attendingId: r.attending_id, attendingName: r.attending_name, status: r.status as Admission["status"], unit: r.unit, room: r.room, reason: r.reason, admitAt: r.admit_at, dischargeAt: r.discharge_at, handoff: h.summary !== undefined ? (h as Handoff) : null };
};

const SELECT = "SELECT a.*, p.name AS patient_name, p.mrn, p.dob, p.sex, u.name AS attending_name FROM admissions a JOIN patients p ON p.id = a.patient_id LEFT JOIN users u ON u.id = a.attending_id";

export const admissions = {
  list: async (u: User, status: "active" | "discharged" | "all" = "active") => (await all<Row>(`${SELECT} WHERE a.org_id = ? ${status === "all" ? "" : "AND a.status = ?"} ORDER BY a.unit, a.room, a.admit_at`, ...(status === "all" ? [u.orgId] : [u.orgId, status]))).map(toAdmission),
  get: async (u: User, id: string) => {
    const r = await get<Row>(`${SELECT} WHERE a.org_id = ? AND a.id = ?`, u.orgId, id);
    return r ? toAdmission(r) : undefined;
  },
};

export function hospitalDay(adm: Pick<Admission, "admitAt">, at: string | Date) {
  const a = new Date(adm.admitAt);
  const b = new Date(at);
  const d0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const d1 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.max(1, Math.round((d1 - d0) / 86400000) + 1);
}

function assertInpatient(u: User) {
  if (!["owner", "admin", "clinician", "scribe"].includes(u.role)) throw new Forbidden("Your role can view the census but not admit or document");
}

export async function admit(u: User, input: { patientId?: string; unit?: string; room?: string; reason?: string; attendingId?: string; admitAt?: string }) {
  assertInpatient(u);
  const patient = input.patientId ? await patients.get(u, input.patientId) : undefined;
  if (!patient) throw new Invalid("Choose a patient");
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new Invalid("Enter the reason for admission");
  if ((await admissions.list(u)).some((a) => a.patientId === patient.id)) throw new Invalid(`${patient.name} is already admitted`);
  const attendingId = input.attendingId ?? (u.role === "scribe" ? undefined : u.id);
  if (!attendingId) throw new Invalid("Choose the attending physician");
  const id = uid("adm_");
  const at = input.admitAt ?? now();
  await run("INSERT INTO admissions (id, org_id, patient_id, attending_id, status, unit, room, reason, admit_at, handoff, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, '{}', ?)", id, u.orgId, patient.id, attendingId, (input.unit ?? "").trim().slice(0, 40), (input.room ?? "").trim().slice(0, 20), reason.slice(0, 200), at, now());
  const enc = await encounters.create(u, { clinicianId: attendingId, patientId: patient.id, scheduledAt: at, visitType: "inpatient", reason: `Admission H&P: ${reason}`, templateId: "hp", setting: "inpatient", admissionId: id });
  await audit.log(u, enc.id, "admission.created", { admissionId: id, unit: input.unit, room: input.room });
  return { admission: (await admissions.get(u, id))!, encounterId: enc.id };
}

export async function startNote(u: User, admissionId: string, kind: "progress" | "discharge", at = new Date()) {
  assertInpatient(u);
  const adm = await admissions.get(u, admissionId);
  if (!adm) throw new Error("Admission not found");
  if (adm.status !== "active") throw new Invalid("This patient has been discharged");
  const list = await encounters.list(u, { admissionId });
  const sameDay = list.find((e) => e.visitType === kind && new Date(e.scheduledAt).toDateString() === at.toDateString());
  if (sameDay) return sameDay.id;
  if (kind === "discharge" && list.some((e) => e.visitType === "discharge" && e.status !== "signed")) return list.find((e) => e.visitType === "discharge")!.id;
  const day = hospitalDay(adm, at);
  const enc = await encounters.create(u, { clinicianId: adm.attendingId, patientId: adm.patientId, scheduledAt: at.toISOString(), visitType: kind, reason: kind === "progress" ? `Hospital day ${day} progress note` : "Discharge summary", templateId: kind === "progress" ? "inpatient_progress" : "discharge", setting: "inpatient", admissionId });
  await audit.log(u, enc.id, kind === "progress" ? "admission.progress_started" : "admission.discharge_started", { admissionId, day });
  return enc.id;
}

async function stay(u: User, enc: Encounter) {
  const list = (await encounters.list(u, { admissionId: enc.admissionId! })).filter((e) => e.id !== enc.id && e.scheduledAt <= enc.scheduledAt);
  return list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function inpatientNote(u: User, enc: EncounterWithClinician, facts: Facts, patient: Patient | null, base: Note): Promise<Note> {
  if (!enc.admissionId) return base;
  const adm = await admissions.get(u, enc.admissionId);
  if (!adm) return base;
  const snap = snapshotFrom(facts, new Date(enc.scheduledAt));
  await artifacts.set(enc.id, "snapshot", snap);
  const prior = await stay(u, enc);
  if (enc.visitType === "progress") {
    const prev = [...prior].reverse().find((e) => e.visitType !== "discharge");
    const prevSnap = prev ? ((await artifacts.get<Snapshot>(prev.id, "snapshot")) ?? null) : null;
    const prevNote = prev ? ((await notes.latest(prev.id))?.content ?? null) : null;
    const interval = { key: "interval", title: `Changes Since Yesterday (Hospital Day ${hospitalDay(adm, enc.scheduledAt)})`, format: "bullets" as const, sentences: intervalChanges(prevSnap, snap) };
    const carried = carryForward(prevNote, facts);
    const utts = await utterances.list(enc.id);
    const reported = utts.filter((x) => x.speaker !== "clinician" && !/\?\s*$/.test(x.text) && x.text.split(/\s+/).length >= 4).slice(0, 4);
    const subjective = [
      { id: "subj_0", text: `Hospital day ${hospitalDay(adm, enc.scheduledAt)} for ${adm.reason.toLowerCase()}.`, evidence: [], kind: "system" as const, support: "strong" as const },
      ...reported.map((x, i) => ({ id: `subj_${i + 1}`, text: `Reports: ${toThirdPerson(x.text.replace(/^(?:yeah|yes|well|so|um),?\s+/i, ""), pronounsFor(patient?.pronouns ?? "", patient?.sex ?? "X")).replace(/(^|[.!?]\s+)([a-z])/g, (_m: string, a: string, b: string) => a + b.toUpperCase())}`, evidence: [x.id], kind: "fact" as const, support: "strong" as const })),
    ];
    const sections = base.sections.map((s) => (/assessment|plan|ap/.test(s.key) && carried.length ? { ...s, sentences: [...s.sentences, ...carried] } : s.key === "subjective" ? { ...s, sentences: subjective } : s));
    return { ...base, sections: [interval, ...sections] };
  }
  if (enc.visitType === "discharge") {
    const days: CourseDay[] = [];
    const orderRows: { order: import("../types").StagedOrder; day: number }[] = [];
    const resulted = new Set<string>();
    for (const e of prior) {
      const rec = await notes.latest(e.id);
      const s = await artifacts.get<Snapshot>(e.id, "snapshot");
      const day = hospitalDay(adm, e.scheduledAt);
      if (rec) days.push({ day, date: e.scheduledAt, note: rec.content, snapshot: s ?? null, kind: e.visitType === "inpatient" ? "admission" : "progress" });
      for (const o of await orders.list(e.id)) orderRows.push({ order: o, day });
      for (const name of Object.keys(s?.results ?? {})) resulted.add(name.toLowerCase().split(" ")[0]);
    }
    for (const name of Object.keys(snap.results)) resulted.add(name.toLowerCase().split(" ")[0]);
    days.push({ day: hospitalDay(adm, enc.scheduledAt), date: enc.scheduledAt, note: base, snapshot: snap, kind: "discharge" });
    const course = hospitalCourse(days.filter((d) => d.kind !== "discharge"));
    if (snap.vitals.Weight && days[0]?.snapshot?.vitals.Weight) course.weightTrend = `${days[0].snapshot.vitals.Weight.value} on admission to ${snap.vitals.Weight.value} at discharge`;
    const lastProblems = [...days].reverse().find((d) => d.snapshot?.problems.length)?.snapshot?.problems ?? [];
    const allProblems = days.flatMap((d) => d.snapshot?.problems ?? []);
    const acuteOnChronic = /acute on chronic/i.test(adm.reason) || days.some((d) => /acute on chronic/i.test(JSON.stringify(d.note.sections)));
    const dx = new Map<string, { label: string; icd10: string }>();
    for (const p of [...lastProblems, ...snap.problems]) {
      if (p.icd10.startsWith("R")) continue;
      const cat = p.icd10.slice(0, 3);
      const best = allProblems.filter((x) => x.icd10.startsWith(cat)).sort((a, b) => Number(/\.9$/.test(a.icd10)) - Number(/\.9$/.test(b.icd10)) || b.icd10.length - a.icd10.length)[0] ?? p;
      let pick = { label: best.label, icd10: best.icd10 };
      if (cat === "I50" && acuteOnChronic && /^I50\.3/.test(pick.icd10)) pick = { label: "Acute on chronic diastolic (congestive) heart failure", icd10: "I50.33" };
      if (cat === "I50" && acuteOnChronic && /^I50\.2/.test(pick.icd10)) pick = { label: "Acute on chronic systolic (congestive) heart failure", icd10: "I50.23" };
      dx.set(cat, pick);
    }
    const snaps = days.map((d) => d.snapshot).filter(Boolean) as Snapshot[];
    const medRec = dischargeMedRec(patient?.chart.medications ?? [], snaps.slice(0, -1), facts);
    const evidence: Record<string, string[]> = {};
    for (const m of facts.meds) evidence[m.name] = m.evidence;
    const followUp = [...(facts.followUp ? [facts.followUp.text] : []), ...facts.orders.filter((o) => o.kind === "referral" || o.kind === "lab").map((o) => `${o.name}${o.detail ? `: ${o.detail}` : ""}`)];
    for (const o of facts.orders) evidence[`${o.name}${o.detail ? `: ${o.detail}` : ""}`] = o.evidence;
    if (facts.followUp) evidence[facts.followUp.text] = facts.followUp.evidence;
    const dcUtts = await utterances.list(enc.id);
    const instructionUtts = dcUtts.filter((x) => x.speaker === "clinician" && /\b(weigh yourself|salt|call us|emergency room|come back|return|avoid|keep taking|walk|exercise|diet|fluid)\b/i.test(x.text) && !/^(?:take|restart|continue|follow up)\b/i.test(x.text.trim()));
    const instructions = instructionUtts.map((x) => x.text.trim());
    for (const x of instructionUtts) evidence[x.text.trim()] = [x.id];
    const procedures = orderRows.filter((r) => (r.order.kind === "imaging" || r.order.kind === "procedure") && r.order.status !== "rejected").map((r) => `${r.order.name} (hospital day ${r.day})`);
    const sections = dischargeSections({
      admitDate: adm.admitAt,
      dischargeDate: enc.scheduledAt,
      reason: adm.reason,
      diagnoses: [...dx.values()],
      course,
      procedures,
      medRec,
      pending: pendingResults(orderRows.filter((r) => r.day >= hospitalDay(adm, enc.scheduledAt) - 1), resulted),
      followUp,
      instructions,
      condition: /improv|better|stable|back to (?:normal|baseline)/i.test(JSON.stringify(lastProblems.map((p) => p.status))) ? "improved and stable" : null,
      evidence,
    });
    return { ...base, sections };
  }
  return base;
}

export async function onInpatientSigned(u: User, enc: Encounter) {
  if (!enc.admissionId || enc.visitType !== "discharge") return;
  await run("UPDATE admissions SET status = 'discharged', discharge_at = ? WHERE id = ? AND org_id = ?", enc.signedAt ?? now(), enc.admissionId, u.orgId);
  await audit.log(u, enc.id, "admission.discharged", { admissionId: enc.admissionId });
  const adm = await admissions.get(u, enc.admissionId);
  if (adm) {
    const { startTcm } = await import("./tcm");
    await startTcm(u, { patientId: adm.patientId, admissionId: adm.id, clinicianId: adm.attendingId, dischargeAt: enc.signedAt ?? now() });
  }
}

export async function draftHandoff(u: User, adm: Admission): Promise<Handoff> {
  const list = (await encounters.list(u, { admissionId: adm.id })).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const last = [...list].reverse().find((e) => e.status === "signed" || e.status === "review");
  const snap = last ? await artifacts.get<Snapshot>(last.id, "snapshot") : null;
  const age = ageFrom(adm.dob);
  const problems = (snap?.problems ?? []).filter((p) => !p.icd10.startsWith("R")).map((p) => `${p.label.toLowerCase()}${p.status ? ` (${p.status})` : ""}`);
  const day = hospitalDay(adm, new Date());
  const actions: string[] = [];
  for (const e of list) for (const o of await orders.list(e.id)) if (o.status !== "rejected" && (o.kind === "lab" || o.kind === "imaging") && hospitalDay(adm, e.scheduledAt) >= day - 1) actions.push(`Follow up ${o.name}`);
  const rec = last ? await notes.latest(last.id) : null;
  const plan = (rec?.content.sections.find((s) => /assessment|plan|ap/.test(s.key))?.sentences ?? []).filter((s) => s.indent && !s.pending).slice(0, 4).map((s) => s.text.replace(/\.$/, ""));
  const labs = Object.entries(snap?.results ?? {}).filter(([, r]) => r.abnormal).map(([n, r]) => `${n} ${r.value}`);
  return {
    severity: adm.handoff?.severity ?? "stable",
    summary: `${age}-year-old ${adm.sex === "F" ? "woman" : adm.sex === "M" ? "man" : "patient"} admitted for ${adm.reason.toLowerCase()}, hospital day ${day}.${problems.length ? ` Active: ${problems.join("; ")}.` : ""}${snap?.vitals.Weight ? ` Weight ${snap.vitals.Weight.value}.` : ""}`,
    actions: [...new Set([...actions, ...plan])].slice(0, 8),
    awareness: labs.length ? `Watch: ${labs.join(", ")}.` : "",
    synthesis: false,
  };
}

export async function saveHandoff(u: User, id: string, h: Partial<Handoff>) {
  assertInpatient(u);
  const adm = await admissions.get(u, id);
  if (!adm) throw new Error("Admission not found");
  const severity = h.severity && ["stable", "watcher", "unstable"].includes(h.severity) ? h.severity : adm.handoff?.severity ?? "stable";
  const next: Handoff = {
    severity,
    summary: String(h.summary ?? adm.handoff?.summary ?? "").slice(0, 1000),
    actions: (h.actions ?? adm.handoff?.actions ?? []).map((x) => String(x).slice(0, 200)).filter((x) => x.trim()).slice(0, 20),
    awareness: String(h.awareness ?? adm.handoff?.awareness ?? "").slice(0, 1000),
    synthesis: !!(h.synthesis ?? false),
    updatedAt: now(),
    updatedBy: u.name,
  };
  await run("UPDATE admissions SET handoff = ? WHERE id = ?", JSON.stringify(next), id);
  await audit.log(u, null, "admission.handoff_updated", { admissionId: id, severity });
  return (await admissions.get(u, id))!;
}

export async function updateAdmission(u: User, id: string, patch: { unit?: string; room?: string; attendingId?: string }) {
  assertInpatient(u);
  const adm = await admissions.get(u, id);
  if (!adm) throw new Error("Admission not found");
  await run("UPDATE admissions SET unit = ?, room = ?, attending_id = ? WHERE id = ?", (patch.unit ?? adm.unit).slice(0, 40), (patch.room ?? adm.room).slice(0, 20), patch.attendingId ?? adm.attendingId, id);
  return (await admissions.get(u, id))!;
}

export async function census(u: User) {
  const list = await admissions.list(u);
  const today = new Date().toDateString();
  return Promise.all(
    list.map(async (a) => {
      const encs = (await encounters.list(u, { admissionId: a.id })).sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt));
      const todays = encs.filter((e) => new Date(e.scheduledAt).toDateString() === today);
      const latest = encs.at(-1);
      return {
        ...a,
        day: hospitalDay(a, new Date()),
        todayNote: todays.at(-1) ? { encounterId: todays.at(-1)!.id, status: todays.at(-1)!.status, kind: todays.at(-1)!.visitType } : null,
        latestEncounterId: latest?.id ?? null,
        handoff: a.handoff ?? (await draftHandoff(u, a)),
        handoffDraft: !a.handoff,
      };
    }),
  );
}

export async function admissionDetail(u: User, id: string) {
  const adm = await admissions.get(u, id);
  if (!adm) return null;
  const encs = (await encounters.list(u, { admissionId: id })).sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt));
  const days: CourseDay[] = [];
  for (const e of encs) {
    const rec = await notes.latest(e.id);
    if (rec && e.visitType !== "discharge") days.push({ day: hospitalDay(adm, e.scheduledAt), date: e.scheduledAt, note: rec.content, snapshot: (await artifacts.get<Snapshot>(e.id, "snapshot")) ?? null, kind: e.visitType === "inpatient" ? "admission" : "progress" });
  }
  const attending = await users.byId(adm.attendingId);
  return {
    admission: { ...adm, day: hospitalDay(adm, adm.dischargeAt ?? new Date()), attendingName: attending?.name ?? adm.attendingName },
    encounters: encs.map((e) => ({ id: e.id, kind: e.visitType, status: e.status, scheduledAt: e.scheduledAt, day: hospitalDay(adm, e.scheduledAt), reason: e.reason })),
    course: hospitalCourse(days),
    weights: days.map((d) => ({ day: d.day, weight: d.snapshot?.vitals.Weight?.value ?? null })).filter((w) => w.weight),
    handoff: adm.handoff ?? (await draftHandoff(u, adm)),
  };
}
