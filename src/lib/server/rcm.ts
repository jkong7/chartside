import { hcc, normalizeIcd } from "../codesets";
import { defaultPayer, type Payer } from "../engine/billing";
import type { Facts } from "../engine/extract";
import { ageFrom } from "../engine/text";
import { reviewDiagnoses } from "../rcm/dx";
import { DEFAULT_BILLING, makeClaimReference, type BillingSettings } from "../rcm/reference";
import { riskSummary } from "../rcm/risk";
import type { CodingResult, Encounter, Patient } from "../types";
import { claims, encounters, orgs, type User } from "./repo";

export async function billingSettings(orgId: string | null): Promise<BillingSettings> {
  const org = orgId ? await orgs.get(orgId) : undefined;
  return { ...DEFAULT_BILLING, ...(org?.settings.billing ?? {}) };
}

export function payerFor(patient: Patient | null, age: number): Payer {
  return patient?.chart.coverage?.payer ?? defaultPayer(age);
}

export async function referenceFor(enc: Pick<Encounter, "scheduledAt">, orgId: string | null) {
  return makeClaimReference({ dos: enc.scheduledAt.slice(0, 10), settings: await billingSettings(orgId) });
}

export function hccMapper(patient: Patient | null, dos: string) {
  const age = patient ? ageFrom(patient.dob, new Date(dos)) : 65;
  const sex = patient?.sex ?? "X";
  return (icd10: string) => hcc.forCode(icd10, { age, sex }).map((h) => ({ hcc: h, label: hcc.label(h) }));
}

async function priorYearCodes(user: User, enc: Encounter) {
  if (!enc.patientId) return [];
  const year = enc.scheduledAt.slice(0, 4);
  const list = await encounters.list(user, { patientId: enc.patientId, from: `${year}-01-01T00:00:00.000Z`, to: enc.scheduledAt });
  const out: string[] = [];
  for (const e of list) {
    if (e.id === enc.id || e.status !== "signed") continue;
    const rec = await claims.get(e.id);
    for (const d of rec?.content.dx ?? []) out.push(normalizeIcd(d.code));
  }
  return out;
}

export async function enrichCoding(user: User, enc: Encounter, patient: Patient | null, coding: CodingResult, facts: Facts): Promise<CodingResult> {
  const dos = enc.scheduledAt.slice(0, 10);
  const age = patient ? ageFrom(patient.dob, new Date(enc.scheduledAt)) : 40;
  const sex = patient?.sex ?? "X";
  const meds = [...(patient?.chart.medications ?? []).map((m) => `${m.name} ${m.dose ?? ""}`), ...facts.meds.filter((m) => !m.cancelled && m.action !== "stop").map((m) => m.name)];
  const inputs = coding.diagnoses.map((d) => ({ code: d.code, label: d.label, problem: d.problem, evidence: d.evidence }));
  const { details } = reviewDiagnoses(inputs, { dos, age, sex, meds });
  const risk = riskSummary({ visitCodes: details.filter((d) => d.billable).map((d) => d.code), chartProblems: patient?.chart.problems ?? [], priorYearCodes: await priorYearCodes(user, enc), age, sex, segment: patient?.chart.coverage?.hccSegment });
  const ref = await referenceFor(enc, user.orgId);
  return {
    ...coding,
    diagnoses: coding.diagnoses.map((d, i) => ({ ...d, label: details[i]?.official ?? d.label })),
    dxDetail: details,
    risk,
    reference: ref.versions(),
  };
}
