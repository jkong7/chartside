import { randomBytes } from "node:crypto";
import { get, jsonText } from "../db";
import { intakeMedList, summarizeIntake, type IntakeAnswers, type IntakeSummary } from "../engine/intake";
import { ageFrom } from "../engine/text";
import { assertCan, Invalid } from "./policy";
import { artifacts, audit, encounters, patients, users, type User } from "./repo";

export interface IntakeRecord {
  token: string;
  createdAt: string;
  submittedAt?: string;
  answers?: IntakeAnswers;
  summary?: IntakeSummary;
}

export async function createIntake(u: User, encId: string) {
  assertCan(u, "clinical.capture");
  const enc = await encounters.get(u, encId);
  if (!enc?.patientId) throw new Invalid("Attach a patient to the visit first");
  const cur = await artifacts.get<IntakeRecord>(enc.id, "intake");
  if (cur) return cur;
  const rec: IntakeRecord = { token: randomBytes(16).toString("hex"), createdAt: new Date().toISOString() };
  await artifacts.set(enc.id, "intake", rec);
  await audit.log(u, enc.id, "intake.created", {});
  return rec;
}

async function byToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const r = await get<{ encounter_id: string }>(`SELECT encounter_id FROM artifacts WHERE kind = 'intake' AND ${jsonText("content", "token")} = ?`, token);
  if (!r) return null;
  const enc = await encounters.byIdUnscoped(r.encounter_id);
  if (!enc?.patientId) return null;
  const patient = await patients.byIdUnscoped(enc.patientId);
  const rec = await artifacts.get<IntakeRecord>(enc.id, "intake");
  return patient && rec ? { enc, patient, rec } : null;
}

export async function publicIntake(token: string) {
  const x = await byToken(token);
  if (!x) return null;
  const clinician = await users.byId(x.enc.userId);
  return {
    patientFirst: x.patient.name.split(" ")[0],
    clinician: clinician?.name ?? "your clinician",
    date: x.enc.scheduledAt,
    lang: x.patient.language === "es" ? "es" : "en",
    meds: intakeMedList(x.patient.chart),
    allergies: x.patient.chart.allergies.map((a) => a.substance),
    olderAdult: ageFrom(x.patient.dob) >= 65,
    submitted: !!x.rec.submittedAt,
  };
}

const n03 = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3 ? (v as number) : null);
const n04 = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4 ? (v as number) : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

export async function submitIntake(token: string, raw: Record<string, unknown>) {
  const x = await byToken(token);
  if (!x) throw new Error("This link is no longer valid");
  if (x.rec.submittedAt) throw new Invalid("Thanks, we already have your answers. Tell your care team if anything changed.");
  const meds = intakeMedList(x.patient.chart);
  const phq = Array.isArray(raw.phq) ? raw.phq.map(n03) : null;
  const gad = Array.isArray(raw.gad) ? raw.gad.map(n03) : null;
  const audit3 = Array.isArray(raw.auditc) ? raw.auditc.map(n04) : null;
  const answers: IntakeAnswers = {
    reason: str(raw.reason, 500),
    symptoms: Array.isArray(raw.symptoms) ? raw.symptoms.filter((s): s is string => typeof s === "string").slice(0, 20).map((s) => s.slice(0, 40)) : [],
    duration: str(raw.duration, 60),
    meds: Array.isArray(raw.meds) ? raw.meds.slice(0, meds.length).map((m, i) => ({ name: meds[i], status: ["taking", "stopped", "different", "not_sure"].includes((m as { status?: string })?.status ?? "") ? ((m as { status: "taking" }).status) : "not_sure", note: str((m as { note?: string })?.note, 120) })) : [],
    newMeds: str(raw.newMeds, 300),
    allergiesConfirmed: typeof raw.allergiesConfirmed === "boolean" ? raw.allergiesConfirmed : undefined,
    newAllergies: str(raw.newAllergies, 200),
    phq: phq && phq.length === 2 && phq.every((v) => v !== null) ? (phq as [number, number]) : undefined,
    gad: gad && gad.length === 2 && gad.every((v) => v !== null) ? (gad as [number, number]) : undefined,
    tobacco: ["never", "former", "current"].includes(raw.tobacco as string) ? (raw.tobacco as IntakeAnswers["tobacco"]) : undefined,
    auditc: audit3 && audit3.length === 3 && audit3.every((v) => v !== null) ? (audit3 as [number, number, number]) : undefined,
    falls: ["none", "one", "two_or_more"].includes(raw.falls as string) ? (raw.falls as IntakeAnswers["falls"]) : undefined,
    food: raw.food === true,
    housing: raw.housing === true,
    transport: raw.transport === true,
    questions: str(raw.questions, 1000),
  };
  if (!answers.reason && !answers.symptoms?.length && !answers.questions) throw new Invalid("Tell us why you're coming in");
  const summary = summarizeIntake(answers, { sex: x.patient.sex, age: ageFrom(x.patient.dob) });
  await artifacts.set(x.enc.id, "intake", { ...x.rec, submittedAt: new Date().toISOString(), answers, summary });
  await audit.log(null, x.enc.id, "intake.submitted", { flags: summary.flags.length });
  return summary;
}
