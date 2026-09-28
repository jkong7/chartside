import { all, get, now, run, uid } from "../db";
import { screen, screenInput, type Trial, type TrialCriteria, type TrialScreen } from "../engine/trials";
import { ageFrom } from "../engine/text";
import type { CodingResult } from "../types";
import { tasks } from "./inbox";
import { assertCan, Invalid } from "./policy";
import { factsFor } from "./pipeline";
import { artifacts, audit, encounters, j, patients, type User } from "./repo";

interface Row {
  id: string;
  title: string;
  sponsor: string;
  nct: string | null;
  contact: string;
  status: string;
  criteria: string;
}

const toTrial = (r: Row): Trial => ({ id: r.id, title: r.title, sponsor: r.sponsor, nct: r.nct, contact: r.contact, status: r.status as Trial["status"], criteria: j<TrialCriteria>(r.criteria, {}) });

const NCT = /^NCT\d{8}$/;

export const trials = {
  list: async (u: User, activeOnly = false) => (await all<Row>(`SELECT * FROM trials WHERE org_id = ? ${activeOnly ? "AND status = 'active'" : ""} ORDER BY created_at DESC`, u.orgId)).map(toTrial),
  get: async (u: User, id: string) => {
    const r = await get<Row>("SELECT * FROM trials WHERE org_id = ? AND id = ?", u.orgId, id);
    return r ? toTrial(r) : undefined;
  },
};

function clean(c: TrialCriteria): TrialCriteria {
  const codes = (xs?: string[]) => (xs ?? []).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]\d[\dA-Z.]*$/.test(x)).slice(0, 30);
  const out: TrialCriteria = {};
  if (Number.isFinite(c.minAge)) out.minAge = Math.max(0, Math.round(c.minAge!));
  if (Number.isFinite(c.maxAge)) out.maxAge = Math.min(120, Math.round(c.maxAge!));
  if (out.minAge !== undefined && out.maxAge !== undefined && out.minAge > out.maxAge) throw new Invalid("Minimum age is above maximum age");
  if (c.sex === "F" || c.sex === "M") out.sex = c.sex;
  if (codes(c.anyDx).length) out.anyDx = codes(c.anyDx);
  if (codes(c.excludeDx).length) out.excludeDx = codes(c.excludeDx);
  const meds = (c.excludeMeds ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean).slice(0, 30);
  if (meds.length) out.excludeMeds = meds;
  const labs = (c.labs ?? []).filter((l) => l.name?.trim() && (l.op === ">=" || l.op === "<=") && Number.isFinite(Number(l.value))).map((l) => ({ name: l.name.trim(), op: l.op, value: Number(l.value) })).slice(0, 10);
  if (labs.length) out.labs = labs;
  if (!out.anyDx && !out.labs && out.minAge === undefined && out.maxAge === undefined) throw new Invalid("Add at least one inclusion criterion");
  return out;
}

export async function saveTrial(u: User, input: { id?: string; title?: string; sponsor?: string; nct?: string | null; contact?: string; status?: string; criteria?: TrialCriteria }) {
  assertCan(u, "org.manage");
  const title = (input.title ?? "").trim();
  if (!title) throw new Invalid("Name the study");
  const nct = (input.nct ?? "").trim().toUpperCase() || null;
  if (nct && !NCT.test(nct)) throw new Invalid("ClinicalTrials.gov IDs look like NCT01234567");
  const criteria = clean(input.criteria ?? {});
  const status = input.status === "closed" ? "closed" : "active";
  if (input.id) {
    if (!(await trials.get(u, input.id))) throw new Error("Study not found");
    await run("UPDATE trials SET title = ?, sponsor = ?, nct = ?, contact = ?, status = ?, criteria = ? WHERE id = ? AND org_id = ?", title.slice(0, 160), (input.sponsor ?? "").slice(0, 120), nct, (input.contact ?? "").slice(0, 160), status, JSON.stringify(criteria), input.id, u.orgId);
    await audit.log(u, null, "trial.updated", { trialId: input.id, status });
    return (await trials.get(u, input.id))!;
  }
  const id = uid("trl_");
  await run("INSERT INTO trials (id, org_id, title, sponsor, nct, contact, status, criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, title.slice(0, 160), (input.sponsor ?? "").slice(0, 120), nct, (input.contact ?? "").slice(0, 160), status, JSON.stringify(criteria), now());
  await audit.log(u, null, "trial.created", { trialId: id });
  return (await trials.get(u, id))!;
}

async function referralsFor(u: User, patientId: string) {
  return all<{ trial_id: string; status: string; created_at: string }>("SELECT trial_id, status, created_at FROM trial_referrals WHERE org_id = ? AND patient_id = ?", u.orgId, patientId);
}

export async function screenEncounter(u: User, encId: string): Promise<(TrialScreen & { referred: boolean; contact: string; nct: string | null })[]> {
  const list = await trials.list(u, true);
  if (!list.length) return [];
  const enc = await encounters.get(u, encId);
  if (!enc?.patientId) return [];
  const { facts, patient } = await factsFor(u, enc);
  if (!patient) return [];
  const coding = await artifacts.get<CodingResult>(encId, "coding");
  const x = screenInput(patient.chart, ageFrom(patient.dob, new Date(enc.scheduledAt)), patient.sex, { dx: [...(coding?.diagnoses.map((d) => d.code) ?? []), ...facts.problems.map((p) => p.icd10)], results: facts.results.map((r) => ({ name: r.name, value: r.value })), meds: facts.meds.filter((m) => m.action !== "stop").map((m) => m.name) });
  const refs = await referralsFor(u, patient.id);
  return list.map((t) => ({ ...screen(t, x), referred: refs.some((r) => r.trial_id === t.id), contact: t.contact, nct: t.nct })).filter((s) => s.status === "likely" || s.status === "possible");
}

export async function referToTrial(u: User, encId: string, trialId: string) {
  assertCan(u, "clinical.edit");
  const enc = await encounters.get(u, encId);
  if (!enc?.patientId) throw new Error("Encounter not found");
  const t = await trials.get(u, trialId);
  if (!t || t.status !== "active") throw new Invalid("That study is not enrolling");
  const match = (await screenEncounter(u, encId)).find((s) => s.trialId === trialId);
  if (!match) throw new Invalid("This patient does not pre-screen for that study");
  if (match.referred) throw new Invalid("Already referred to this study");
  const id = uid("trf_");
  await run("INSERT INTO trial_referrals (id, org_id, trial_id, patient_id, encounter_id, status, referred_by, created_at) VALUES (?, ?, ?, ?, ?, 'referred', ?, ?)", id, u.orgId, trialId, enc.patientId, encId, u.id, now());
  await tasks.create({ orgId: u.orgId, encounterId: encId, patientId: enc.patientId, assigneeId: enc.userId, kind: "referral", key: `trial:${trialId}`, title: `Send pre-screen to study team: ${t.title}`, detail: `${t.contact ? `Contact ${t.contact}. ` : ""}Confirm the patient's interest and send the pre-screen summary. Unconfirmed criteria: ${match.unknown.join("; ") || "none"}.`, dueAt: new Date(Date.now() + 3 * 86400000).toISOString(), evidence: [], source: "manual", createdBy: u.id });
  await audit.log(u, encId, "trial.referred", { trialId, status: match.status });
  return id;
}

export async function researchDashboard(u: User) {
  const list = await trials.list(u);
  const pats = await patients.list(u);
  const out = [];
  for (const t of list) {
    const refs = await all<{ patient_id: string; created_at: string }>("SELECT patient_id, created_at FROM trial_referrals WHERE org_id = ? AND trial_id = ?", u.orgId, t.id);
    const candidates: { patientId: string; name: string; status: TrialScreen["status"]; unknown: string[]; referred: boolean }[] = [];
    if (t.status === "active") {
      for (const p of pats) {
        const x = screenInput(p.chart, ageFrom(p.dob), p.sex, { dx: [], results: [], meds: [] });
        const s = screen(t, x);
        if (s.status === "likely" || s.status === "possible") candidates.push({ patientId: p.id, name: p.name, status: s.status, unknown: s.unknown, referred: refs.some((r) => r.patient_id === p.id) });
      }
    }
    out.push({ ...t, referrals: refs.length, candidates });
  }
  return out;
}
