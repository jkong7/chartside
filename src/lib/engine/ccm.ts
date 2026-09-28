import type { Chart } from "../types";
import { CONDITIONS } from "./lexicon";

export interface CarePlanItem {
  problem: string;
  icd10: string | null;
  goal: string;
  interventions: string[];
}

const GOALS: [RegExp, string, string[]][] = [
  [/^E1[01]|diabetes/i, "Hemoglobin A1c under 7% (individualize for older adults)", ["Review glucose logs monthly", "Annual eye, foot, and kidney screening", "Medication adherence check"]],
  [/^I1[0-6]|hypertension/i, "Blood pressure under 130/80", ["Home blood pressure log reviewed monthly", "Sodium reduction and activity coaching"]],
  [/^I50|heart failure/i, "No heart failure hospitalizations; stable daily weight", ["Daily weights with a call if up 3 lb in a day or 5 lb in a week", "Low-sodium diet", "Guideline-directed medications optimized"]],
  [/^E78|hyperlipidemia|cholesterol/i, "LDL at goal for cardiovascular risk", ["Statin adherence", "Lipid panel yearly"]],
  [/^N18|kidney disease/i, "Slow progression; avoid nephrotoxins", ["eGFR and urine albumin every 6 to 12 months", "Avoid NSAIDs"]],
  [/^J44|COPD/i, "Fewer exacerbations; maintain activity", ["Inhaler technique review", "Action plan for flares", "Vaccines up to date"]],
  [/^J45|asthma/i, "Well-controlled asthma", ["Controller adherence", "Asthma action plan"]],
  [/^F3[23]|depress/i, "PHQ-9 under 5 or 50% improvement", ["PHQ-9 each month", "Therapy engagement"]],
  [/^F41|anxiety/i, "GAD-7 improvement", ["GAD-7 each month", "Therapy engagement"]],
  [/^I48|atrial fibrillation/i, "Rate controlled; stroke prevention", ["Anticoagulant adherence and bleeding check"]],
  [/^M1[5-9]|osteoarthritis/i, "Maintain function with less pain", ["Exercise program", "Weight management"]],
  [/^E66|obesity/i, "5 to 10% weight loss", ["Nutrition and activity plan"]],
  [/^E03|hypothyroid/i, "TSH in range", ["TSH yearly"]],
];

export function chronicProblems(chart: Chart) {
  return chart.problems.filter((p) => {
    const code = p.icd10 ?? "";
    if (/^[RZ]/.test(code)) return false;
    const def = CONDITIONS.find((c) => (code && c.icd10.slice(0, 3) === code.slice(0, 3)) || c.patterns.some((re) => re.test(p.name)));
    return def ? def.chronic : GOALS.some(([re]) => re.test(code) || re.test(p.name));
  });
}

export function ccmEligible(chart: Chart) {
  const chronic = chronicProblems(chart);
  return { eligible: chronic.length >= 2, chronic: chronic.map((p) => p.name) };
}

export function draftCarePlan(chart: Chart): CarePlanItem[] {
  return chronicProblems(chart).map((p) => {
    const g = GOALS.find(([re]) => re.test(p.icd10 ?? "") || re.test(p.name));
    return { problem: p.name, icd10: p.icd10 ?? null, goal: g?.[1] ?? "Stable symptoms and function", interventions: g?.[2] ?? ["Monthly check-in"] };
  });
}

export interface MonthTotals {
  staffMinutes: number;
  physicianMinutes: number;
  codes: { cpt: string; units: number; label: string }[];
  remainingFor99490: number;
}

export function monthCodes(logs: { minutes: number; role: "staff" | "physician" }[]): MonthTotals {
  const staff = logs.filter((l) => l.role === "staff").reduce((n, l) => n + l.minutes, 0);
  const phys = logs.filter((l) => l.role === "physician").reduce((n, l) => n + l.minutes, 0);
  const codes: MonthTotals["codes"] = [];
  if (phys >= 30) {
    codes.push({ cpt: "99491", units: 1, label: "CCM by physician or QHP, first 30 minutes" });
    if (phys >= 60) codes.push({ cpt: "99437", units: 1, label: "CCM by physician or QHP, each additional 30 minutes" });
  } else if (staff >= 20) {
    codes.push({ cpt: "99490", units: 1, label: "CCM by clinical staff, first 20 minutes" });
    const extra = Math.min(2, Math.floor((staff - 20) / 20));
    if (extra) codes.push({ cpt: "99439", units: extra, label: "CCM by clinical staff, each additional 20 minutes" });
  }
  return { staffMinutes: staff, physicianMinutes: phys, codes, remainingFor99490: Math.max(0, 20 - staff) };
}
