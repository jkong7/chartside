import { hcc, normalizeIcd } from "../codesets";
import { riskSummary } from "../rcm/risk";
import { ageFrom } from "../engine/text";
import type { Chart } from "../types";
import { claims, encounters, patients, type User } from "./repo";

export interface EvidenceSuspect {
  condition: string;
  suggestedCode: string;
  evidence: string;
  hccs: string[];
}

const num = (v?: string) => (v ? Number.parseFloat(v) : NaN);
const hasDx = (chart: Chart, re: RegExp) => chart.problems.some((p) => re.test(p.icd10 ?? "") || re.test(p.name));

export function evidenceSuspects(chart: Chart, age: number, sex: string): EvidenceSuspect[] {
  const out: EvidenceSuspect[] = [];
  const labs = [...(chart.labs ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const egfrs = labs.filter((l) => /egfr/i.test(l.name) && num(l.value) < 60);
  const egfrFromChart = chart.egfr !== undefined && chart.egfr < 60;
  if (!hasDx(chart, /^N18|kidney disease|CKD/i) && (egfrs.length >= 2 ? (new Date(egfrs.at(-1)!.date).getTime() - new Date(egfrs[0].date).getTime()) / 86400000 >= 90 : egfrs.length === 1 || egfrFromChart)) {
    const v = egfrs.at(-1) ? num(egfrs.at(-1)!.value) : chart.egfr!;
    const code = v >= 45 ? "N18.31" : v >= 30 ? "N18.32" : v >= 15 ? "N18.4" : "N18.5";
    out.push({ condition: `Chronic kidney disease stage ${v >= 45 ? "3a" : v >= 30 ? "3b" : v >= 15 ? "4" : "5"}`, suggestedCode: code, evidence: egfrs.length >= 2 ? `eGFR under 60 on ${egfrs.length} results over 90 or more days (latest ${egfrs.at(-1)!.value})` : `eGFR ${egfrs.at(-1)?.value ?? `${chart.egfr}`}; confirm with a repeat at least 90 days apart`, hccs: hcc.forCode(normalizeIcd(code), { age, sex }) });
  }
  const a1c = labs.filter((l) => /a1c/i.test(l.name)).at(-1);
  if (a1c && num(a1c.value) >= 6.5 && !hasDx(chart, /^E1[01]|diabetes/i)) out.push({ condition: "Type 2 diabetes", suggestedCode: "E11.9", evidence: `Hemoglobin A1c ${a1c.value} on ${a1c.date} with no diabetes diagnosis`, hccs: hcc.forCode("E119", { age, sex }) });
  const bmi = num(chart.vitals?.BMI);
  if (bmi >= 40 && !hasDx(chart, /^E66\.01|morbid|severe obesity/i)) out.push({ condition: "Severe obesity", suggestedCode: "E66.01", evidence: `BMI ${bmi}; document with Z68.41 or higher`, hccs: hcc.forCode("E6601", { age, sex }) });
  const phq9 = (chart.screenings ?? []).filter((s) => /phq-?9/i.test(s.name)).at(-1);
  if (phq9 && num(phq9.result) >= 10 && !hasDx(chart, /^F3[23]|depress/i)) out.push({ condition: "Major depressive disorder", suggestedCode: "F32.A", evidence: `PHQ-9 ${phq9.result} on ${phq9.date}; clinical assessment needed`, hccs: hcc.forCode("F32A", { age, sex }) });
  return out;
}

export async function riskWorklist(u: User) {
  const year = new Date().getFullYear();
  const list = await patients.list(u);
  const rows = [];
  for (const p of list) {
    const payer = p.chart.coverage?.payer;
    const age = ageFrom(p.dob);
    if (!(payer === "Medicare" || payer === "Medicare Advantage" || (!payer && age >= 65))) continue;
    const encs = await encounters.list(u, { patientId: p.id });
    const priorYear: string[] = [];
    for (const e of encs.filter((x) => x.status === "signed" && x.scheduledAt.startsWith(String(year)))) for (const d of (await claims.get(e.id))?.content.dx ?? []) priorYear.push(normalizeIcd(d.code));
    const r = riskSummary({ visitCodes: [], chartProblems: p.chart.problems, priorYearCodes: priorYear, age, sex: p.sex, segment: p.chart.coverage?.hccSegment });
    const captured = priorYear.length ? riskSummary({ visitCodes: priorYear, chartProblems: [], priorYearCodes: [], age, sex: p.sex, segment: p.chart.coverage?.hccSegment }).total : r.total;
    const evidence = evidenceSuspects(p.chart, age, p.sex);
    if (!r.suspects.length && !evidence.length) continue;
    const next = encs.find((e) => e.status !== "signed" && new Date(e.scheduledAt) >= new Date(new Date().setHours(0, 0, 0, 0)));
    rows.push({
      patientId: p.id,
      name: p.name,
      age,
      payer: payer ?? "Medicare",
      capturedRaf: Math.round(captured * 1000) / 1000,
      opportunity: Math.round(r.suspects.reduce((n, s) => n + s.delta, 0) * 1000) / 1000,
      recapture: r.suspects.map((s) => ({ code: s.code, label: s.label, hccs: s.hccs.map((h) => `HCC ${h.hcc}`), delta: s.delta })),
      evidence,
      nextVisit: next ? { id: next.id, at: next.scheduledAt } : null,
      lastSeen: encs.filter((e) => e.status === "signed").at(-1)?.scheduledAt ?? null,
    });
  }
  return rows.sort((a, b) => b.opportunity - a.opportunity || b.evidence.length - a.evidence.length);
}
