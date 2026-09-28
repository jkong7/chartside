import type { Snapshot } from "./inpatient";

export interface StayDay {
  day: number;
  kind: "admission" | "progress" | "discharge";
  snapshot: Snapshot | null;
  problems: { icd10: string; label: string }[];
}

export interface CdiQuery {
  key: string;
  condition: string;
  code: string;
  severity: "MCC" | "CC" | "none";
  indicators: string[];
  question: string;
  options: string[];
}

export interface PoaLine {
  code: string;
  label: string;
  poa: "Y" | "N" | "U";
  basis: string;
}

const num = (v?: string) => {
  const m = v ? /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, "")) : null;
  return m ? Number(m[0]) : null;
};

const series = (days: StayDay[], name: string, from: "results" | "vitals") =>
  days.map((d) => ({ day: d.day, v: num(from === "results" ? d.snapshot?.results[name]?.value : d.snapshot?.vitals[name]?.value) })).filter((x): x is { day: number; v: number } => x.v !== null);

const documented = (days: StayDay[], re: RegExp) => days.some((d) => d.problems.some((p) => re.test(p.icd10) || re.test(p.label)));

const OPTIONS = (dx: string) => [dx, "Other (please specify)", "Clinically undetermined", "Not clinically supported"];

export function prebillReview(days: StayDay[]): { queries: CdiQuery[]; poa: PoaLine[] } {
  const q: CdiQuery[] = [];
  const cr = series(days, "Creatinine", "results");
  if (cr.length >= 2 && !documented(days, /^N17|acute kidney/i)) {
    const base = Math.min(...cr.map((x) => x.v));
    const rise48 = cr.some((x, i) => i > 0 && x.day - cr[i - 1].day <= 2 && x.v - cr[i - 1].v >= 0.3);
    const ratio = Math.max(...cr.map((x) => x.v)) / base;
    if (rise48 || ratio >= 1.5) q.push({ key: "aki", condition: "Acute kidney injury", code: "N17.9", severity: "CC", indicators: [`Creatinine ${cr.map((x) => `${x.v} (day ${x.day})`).join(", ")}`, rise48 ? "Rise of 0.3 mg/dL or more within 48 hours (KDIGO)" : `Peak ${ratio.toFixed(1)} times the lowest value this stay (KDIGO)`], question: "Creatinine changed during this stay as shown. Based on your clinical judgment, can you clarify the associated diagnosis?", options: [...OPTIONS("Acute kidney injury"), "Expected variation without a kidney diagnosis"] });
  }
  const na = series(days, "Sodium", "results");
  const lowNa = na.filter((x) => x.v < 135);
  if (lowNa.length && !documented(days, /^E87\.1|hyponatremia/i)) q.push({ key: "hypoNa", condition: "Hyponatremia", code: "E87.1", severity: "CC", indicators: [`Sodium ${lowNa.map((x) => `${x.v} (day ${x.day})`).join(", ")}`], question: "Low sodium values were recorded. Is there an associated diagnosis being monitored or treated?", options: OPTIONS("Hyponatremia") });
  const k = series(days, "Potassium", "results");
  const lowK = k.filter((x) => x.v < 3.5);
  if (lowK.length && !documented(days, /^E87\.6|hypokalemia/i)) q.push({ key: "hypoK", condition: "Hypokalemia", code: "E87.6", severity: "none", indicators: [`Potassium ${lowK.map((x) => `${x.v} (day ${x.day})`).join(", ")}`], question: "Low potassium values were recorded. Is there an associated diagnosis being monitored or treated?", options: OPTIONS("Hypokalemia") });
  const spo2 = series(days, "SpO2", "vitals");
  const lowO2 = spo2.filter((x) => x.v <= 90);
  if (lowO2.length && !documented(days, /^J96|respiratory failure/i)) q.push({ key: "arf", condition: "Acute hypoxic respiratory failure", code: "J96.01", severity: "MCC", indicators: [`SpO2 ${lowO2.map((x) => `${x.v}% (day ${x.day})`).join(", ")}`, "Document work of breathing, respiratory rate, and oxygen requirement if applicable"], question: "Low oxygen saturation was recorded. Based on your clinical judgment, which diagnosis best describes the patient's condition?", options: [...OPTIONS("Acute hypoxic respiratory failure"), "Hypoxemia without respiratory failure"] });
  const hgb = series(days, "Hemoglobin", "results");
  if (hgb.length >= 2 && !documented(days, /^D6[2-4]|anemia/i)) {
    const drop = Math.max(...hgb.map((x) => x.v)) - Math.min(...hgb.map((x) => x.v));
    if (drop >= 2) q.push({ key: "abla", condition: "Acute blood loss anemia", code: "D62", severity: "CC", indicators: [`Hemoglobin ${hgb.map((x) => `${x.v} (day ${x.day})`).join(", ")}`, `Drop of ${drop.toFixed(1)} g/dL`], question: "Hemoglobin fell during this stay as shown. Can you clarify the associated diagnosis, if any?", options: [...OPTIONS("Acute blood loss anemia"), "Dilutional change"] });
  }
  const wbc = series(days, "WBC", "results");
  const hr = series(days, "HR", "vitals");
  const temp = series(days, "Temp", "vitals");
  const sirsDay = wbc.find((w) => (w.v > 12 || w.v < 4) && (hr.some((h) => h.day === w.day && h.v > 90) || temp.some((t) => t.day === w.day && (t.v > 100.4 || t.v < 96.8))));
  if (sirsDay && !documented(days, /^A4[01]|^R65|sepsis/i)) q.push({ key: "sepsis", condition: "Sepsis", code: "A41.9", severity: "MCC", indicators: [`WBC ${sirsDay.v} with ${hr.find((h) => h.day === sirsDay.day && h.v > 90) ? `HR ${hr.find((h) => h.day === sirsDay.day)!.v}` : `temperature ${temp.find((t) => t.day === sirsDay.day)!.v}`} on day ${sirsDay.day}`], question: "SIRS criteria were met on the day shown. Based on your clinical judgment, can you clarify whether an infection-related diagnosis applies?", options: [...OPTIONS("Sepsis"), "Localized infection without sepsis", "SIRS of non-infectious origin"] });
  if (documented(days, /^I50\.9$/) && !documented(days, /^I50\.(?:[2-4]\d)$/)) q.push({ key: "hf", condition: "Heart failure type and acuity", code: "I50.9", severity: "MCC", indicators: ["Heart failure is documented without type (systolic, diastolic, combined) or acuity (acute, chronic, acute on chronic)", ...(series(days, "BNP", "results").length ? [`BNP ${series(days, "BNP", "results").map((x) => `${x.v} (day ${x.day})`).join(", ")}`] : [])], question: "Can the heart failure be further specified by type and acuity?", options: ["Acute on chronic diastolic (I50.33)", "Acute on chronic systolic (I50.23)", "Acute on chronic combined (I50.43)", "Chronic, type as documented", "Clinically undetermined"] });
  const bmi = series(days, "BMI", "vitals").at(-1);
  if (bmi && bmi.v >= 40 && !documented(days, /^Z68\.4|^E66\.01|morbid|severe obesity/i)) q.push({ key: "bmi", condition: "Severe obesity with BMI", code: "E66.01 + Z68.41", severity: "CC", indicators: [`BMI ${bmi.v}`], question: "A BMI of 40 or more was recorded. Is there an associated diagnosis that affects care?", options: OPTIONS("Severe (morbid) obesity") });

  const first = days.find((d) => d.kind === "admission");
  const seen = new Map<string, PoaLine>();
  for (const d of days) {
    for (const p of d.problems) {
      if (seen.has(p.icd10)) continue;
      const onAdmission = first ? first.problems.some((x) => x.icd10.slice(0, 3) === p.icd10.slice(0, 3)) : false;
      seen.set(p.icd10, { code: p.icd10, label: p.label, poa: !first ? "U" : onAdmission ? "Y" : d.day <= 1 ? "Y" : "N", basis: !first ? "No admission H&P on file" : onAdmission ? "Documented in the admission H&P" : d.day <= 1 ? "Documented on the day of admission" : `First documented on hospital day ${d.day}` });
    }
  }
  return { queries: q, poa: [...seen.values()] };
}
