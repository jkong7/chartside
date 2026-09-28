import type { Chart } from "../types";
import type { Facts } from "./extract";
import { ageFrom } from "./text";

export type CalcInput =
  | { key: string; label: string; type: "number"; unit?: string; min?: number; max?: number; step?: number }
  | { key: string; label: string; type: "boolean"; points?: number }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] };

export interface CalcResult {
  value: number;
  display: string;
  band: "low" | "moderate" | "high";
  interpretation: string;
  noteText: string;
  alert?: string;
}

export interface Calculator {
  id: string;
  name: string;
  category: "Renal" | "Cardiology" | "Pulmonary" | "Infectious disease" | "Behavioral health" | "General" | "Pediatrics";
  inputs: CalcInput[];
  source: string;
  compute: (v: Record<string, number | boolean | string>) => CalcResult | { missing: string[] };
}

export type CalcValues = Record<string, number | boolean | string>;

const num = (v: CalcValues, k: string) => (typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : typeof v[k] === "string" && v[k] !== "" && Number.isFinite(Number(v[k])) ? Number(v[k]) : null);
const yes = (v: CalcValues, k: string) => v[k] === true || v[k] === "true";
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

function need(v: CalcValues, keys: [string, string][]) {
  const missing = keys.filter(([k]) => num(v, k) === null).map(([, l]) => l);
  return missing.length ? { missing } : null;
}

function points(v: CalcValues, inputs: CalcInput[]) {
  return inputs.reduce((n, i) => n + (i.type === "boolean" && yes(v, i.key) ? i.points ?? 1 : 0), 0);
}

const PHQ_ITEMS = ["Little interest or pleasure in doing things", "Feeling down, depressed, or hopeless", "Trouble falling or staying asleep, or sleeping too much", "Feeling tired or having little energy", "Poor appetite or overeating", "Feeling bad about yourself, or that you are a failure", "Trouble concentrating", "Moving or speaking slowly, or being fidgety or restless", "Thoughts that you would be better off dead, or of hurting yourself"];
const GAD_ITEMS = ["Feeling nervous, anxious, or on edge", "Not being able to stop or control worrying", "Worrying too much about different things", "Trouble relaxing", "Being so restless that it is hard to sit still", "Becoming easily annoyed or irritable", "Feeling afraid as if something awful might happen"];
const FREQ = [{ value: "0", label: "Not at all (0)" }, { value: "1", label: "Several days (1)" }, { value: "2", label: "More than half the days (2)" }, { value: "3", label: "Nearly every day (3)" }];

const WELLS: CalcInput[] = [
  { key: "dvt", label: "Clinical signs of DVT", type: "boolean", points: 3 },
  { key: "likely", label: "PE is the most likely diagnosis", type: "boolean", points: 3 },
  { key: "hr", label: "Heart rate over 100", type: "boolean", points: 1.5 },
  { key: "immob", label: "Immobilized 3+ days or surgery in the last 4 weeks", type: "boolean", points: 1.5 },
  { key: "prior", label: "Previous DVT or PE", type: "boolean", points: 1.5 },
  { key: "hemoptysis", label: "Hemoptysis", type: "boolean", points: 1 },
  { key: "cancer", label: "Active cancer", type: "boolean", points: 1 },
];

const CHADS: CalcInput[] = [
  { key: "chf", label: "Congestive heart failure", type: "boolean", points: 1 },
  { key: "htn", label: "Hypertension", type: "boolean", points: 1 },
  { key: "diabetes", label: "Diabetes", type: "boolean", points: 1 },
  { key: "stroke", label: "Prior stroke, TIA, or thromboembolism", type: "boolean", points: 2 },
  { key: "vascular", label: "Vascular disease (MI, PAD, aortic plaque)", type: "boolean", points: 1 },
];

const HASBLED: CalcInput[] = [
  { key: "htn", label: "Uncontrolled hypertension (systolic over 160)", type: "boolean" },
  { key: "renal", label: "Abnormal renal function (dialysis, transplant, Cr 2.26 or higher)", type: "boolean" },
  { key: "liver", label: "Abnormal liver function (cirrhosis, bilirubin over 2x, AST/ALT over 3x)", type: "boolean" },
  { key: "stroke", label: "Prior stroke", type: "boolean" },
  { key: "bleeding", label: "Prior major bleeding or predisposition", type: "boolean" },
  { key: "inr", label: "Labile INR", type: "boolean" },
  { key: "elderly", label: "Age over 65", type: "boolean" },
  { key: "drugs", label: "Antiplatelet or NSAID use", type: "boolean" },
  { key: "alcohol", label: "Alcohol, 8 or more drinks a week", type: "boolean" },
];

const CURB: CalcInput[] = [
  { key: "confusion", label: "Confusion", type: "boolean" },
  { key: "bun", label: "BUN over 19 mg/dL (urea over 7 mmol/L)", type: "boolean" },
  { key: "rr", label: "Respiratory rate 30 or higher", type: "boolean" },
  { key: "bp", label: "Systolic under 90 or diastolic 60 or lower", type: "boolean" },
  { key: "age65", label: "Age 65 or older", type: "boolean" },
];

const CENTOR: CalcInput[] = [
  { key: "fever", label: "Temperature over 38 °C (100.4 °F)", type: "boolean" },
  { key: "nocough", label: "Absence of cough", type: "boolean" },
  { key: "nodes", label: "Tender, swollen anterior cervical nodes", type: "boolean" },
  { key: "exudate", label: "Tonsillar swelling or exudate", type: "boolean" },
];

const DRUGS: Record<string, { label: string; mgPerKg: number; perDay: number; maxDose: number; maxDay: number; concentration: string; mgPerMl: number; freq: string; note?: string }> = {
  acetaminophen: { label: "Acetaminophen", mgPerKg: 15, perDay: 5, maxDose: 1000, maxDay: 4000, concentration: "160 mg/5 mL", mgPerMl: 32, freq: "every 4 to 6 hours as needed, no more than 5 doses in 24 hours" },
  ibuprofen: { label: "Ibuprofen (6 months and older)", mgPerKg: 10, perDay: 4, maxDose: 600, maxDay: 2400, concentration: "100 mg/5 mL", mgPerMl: 20, freq: "every 6 to 8 hours as needed with food" },
  amox_high: { label: "Amoxicillin, high dose (acute otitis media)", mgPerKg: 45, perDay: 2, maxDose: 2000, maxDay: 4000, concentration: "400 mg/5 mL", mgPerMl: 80, freq: "twice daily (90 mg/kg/day)" },
  amox_std: { label: "Amoxicillin, standard dose", mgPerKg: 25, perDay: 2, maxDose: 1000, maxDay: 2000, concentration: "400 mg/5 mL", mgPerMl: 80, freq: "twice daily (50 mg/kg/day)" },
  cephalexin: { label: "Cephalexin", mgPerKg: 12.5, perDay: 4, maxDose: 500, maxDay: 4000, concentration: "250 mg/5 mL", mgPerMl: 50, freq: "four times daily (50 mg/kg/day)" },
  azithro: { label: "Azithromycin (day 1 of 5)", mgPerKg: 10, perDay: 1, maxDose: 500, maxDay: 500, concentration: "200 mg/5 mL", mgPerMl: 40, freq: "once on day 1, then 5 mg/kg (max 250 mg) daily on days 2 to 5" },
};

export const CALCULATORS: Calculator[] = [
  {
    id: "egfr",
    name: "eGFR (CKD-EPI 2021)",
    category: "Renal",
    source: "Inker LA et al. N Engl J Med 2021;385:1737-49 (race-free CKD-EPI creatinine equation)",
    inputs: [
      { key: "scr", label: "Serum creatinine", type: "number", unit: "mg/dL", min: 0.1, max: 20, step: 0.01 },
      { key: "age", label: "Age", type: "number", unit: "years", min: 18, max: 120 },
      { key: "sex", label: "Sex", type: "select", options: [{ value: "F", label: "Female" }, { value: "M", label: "Male" }] },
    ],
    compute: (v) => {
      const m = need(v, [["scr", "Serum creatinine"], ["age", "Age"]]);
      if (m) return m;
      const f = v.sex === "F";
      const k = f ? 0.7 : 0.9;
      const a = f ? -0.241 : -0.302;
      const r = num(v, "scr")! / k;
      const egfr = 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** num(v, "age")! * (f ? 1.012 : 1);
      const e = Math.round(egfr);
      const stage = e >= 90 ? "G1" : e >= 60 ? "G2" : e >= 45 ? "G3a" : e >= 30 ? "G3b" : e >= 15 ? "G4" : "G5";
      return { value: e, display: `${e} mL/min/1.73m²`, band: e >= 60 ? "low" : e >= 30 ? "moderate" : "high", interpretation: `CKD stage ${stage} by GFR category. Confirm with a repeat value over 3 months and a urine albumin-creatinine ratio.`, noteText: `eGFR ${e} mL/min/1.73m² (CKD-EPI 2021, creatinine ${num(v, "scr")} mg/dL), GFR category ${stage}.` };
    },
  },
  {
    id: "cha2ds2vasc",
    name: "CHA₂DS₂-VASc",
    category: "Cardiology",
    source: "Lip GY et al. Chest 2010;137:263-72; 2023 ACC/AHA/ACCP/HRS atrial fibrillation guideline",
    inputs: [{ key: "age", label: "Age", type: "number", unit: "years", min: 18, max: 120 }, { key: "sex", label: "Sex", type: "select", options: [{ value: "F", label: "Female" }, { value: "M", label: "Male" }] }, ...CHADS],
    compute: (v) => {
      const m = need(v, [["age", "Age"]]);
      if (m) return m;
      const age = num(v, "age")!;
      const s = points(v, CHADS) + (age >= 75 ? 2 : age >= 65 ? 1 : 0) + (v.sex === "F" ? 1 : 0);
      const nonSex = s - (v.sex === "F" ? 1 : 0);
      const band = nonSex >= 2 ? "high" : nonSex === 1 ? "moderate" : "low";
      return { value: s, display: `${s} points`, band, interpretation: band === "high" ? "Oral anticoagulation is recommended unless contraindicated." : band === "moderate" ? "Oral anticoagulation is reasonable; weigh bleeding risk and patient preference." : "Low stroke risk; anticoagulation is not recommended.", noteText: `CHA2DS2-VASc score ${s}${band === "high" ? "; anticoagulation recommended" : band === "moderate" ? "; anticoagulation reasonable after shared decision-making" : "; low stroke risk"}.` };
    },
  },
  {
    id: "hasbled",
    name: "HAS-BLED",
    category: "Cardiology",
    source: "Pisters R et al. Chest 2010;138:1093-100",
    inputs: HASBLED,
    compute: (v) => {
      const s = points(v, HASBLED);
      const band = s >= 3 ? "high" : s === 2 ? "moderate" : "low";
      return { value: s, display: `${s} points`, band, interpretation: s >= 3 ? "High bleeding risk. Address modifiable factors and follow closely; this alone is not a reason to withhold anticoagulation." : "Bleeding risk is not high.", noteText: `HAS-BLED score ${s} (${band} bleeding risk).` };
    },
  },
  {
    id: "curb65",
    name: "CURB-65",
    category: "Pulmonary",
    source: "Lim WS et al. Thorax 2003;58:377-82",
    inputs: CURB,
    compute: (v) => {
      const s = points(v, CURB);
      const mort = ["0.6%", "2.7%", "6.8%", "14%", "27.8%", "27.8%"][s];
      const band = s >= 3 ? "high" : s === 2 ? "moderate" : "low";
      return { value: s, display: `${s} points`, band, interpretation: `${s <= 1 ? "Outpatient treatment is usually appropriate." : s === 2 ? "Consider a short admission or closely supervised outpatient care." : "Severe pneumonia; hospitalize and consider ICU."} 30-day mortality about ${mort}.`, noteText: `CURB-65 score ${s} (30-day mortality about ${mort}).` };
    },
  },
  {
    id: "centor",
    name: "Centor score (McIsaac)",
    category: "Infectious disease",
    source: "McIsaac WJ et al. JAMA 2004;291:1587-95",
    inputs: [{ key: "age", label: "Age", type: "number", unit: "years", min: 3, max: 120 }, ...CENTOR],
    compute: (v) => {
      const m = need(v, [["age", "Age"]]);
      if (m) return m;
      const age = num(v, "age")!;
      const s = points(v, CENTOR) + (age <= 14 ? 1 : age >= 45 ? -1 : 0);
      const band = s >= 4 ? "high" : s >= 2 ? "moderate" : "low";
      return { value: s, display: `${s} points`, band, interpretation: s <= 1 ? "Strep is unlikely; no testing or antibiotics." : s <= 3 ? "Test with a rapid strep antigen or culture; treat if positive." : "High likelihood; test, and treat if positive.", noteText: `Modified Centor (McIsaac) score ${s}; ${s <= 1 ? "no strep testing indicated" : "rapid strep testing indicated"}.` };
    },
  },
  {
    id: "wells_pe",
    name: "Wells score for PE",
    category: "Pulmonary",
    source: "Wells PS et al. Thromb Haemost 2000;83:416-20",
    inputs: WELLS,
    compute: (v) => {
      const s = points(v, WELLS);
      const band = s > 6 ? "high" : s >= 2 ? "moderate" : "low";
      return { value: s, display: `${s} points`, band, interpretation: `${band === "high" ? "High" : band === "moderate" ? "Moderate" : "Low"} pretest probability. Two-tier: PE ${s > 4 ? "likely; proceed to CT pulmonary angiography" : "unlikely; check a D-dimer (or apply PERC if low risk)"}.`, noteText: `Wells PE score ${s} (PE ${s > 4 ? "likely" : "unlikely"}).` };
    },
  },
  {
    id: "phq9",
    name: "PHQ-9 depression",
    category: "Behavioral health",
    source: "Kroenke K et al. J Gen Intern Med 2001;16:606-13",
    inputs: PHQ_ITEMS.map((label, i) => ({ key: `q${i + 1}`, label, type: "select" as const, options: FREQ })),
    compute: (v) => {
      const missing = PHQ_ITEMS.map((l, i) => (v[`q${i + 1}`] === undefined || v[`q${i + 1}`] === "" ? l : null)).filter(Boolean) as string[];
      if (missing.length) return { missing };
      const s = PHQ_ITEMS.reduce((n, _, i) => n + Number(v[`q${i + 1}`]), 0);
      const sev = s <= 4 ? "minimal" : s <= 9 ? "mild" : s <= 14 ? "moderate" : s <= 19 ? "moderately severe" : "severe";
      const si = Number(v.q9) > 0;
      return { value: s, display: `${s} / 27`, band: s >= 15 ? "high" : s >= 10 ? "moderate" : "low", interpretation: `${sev.charAt(0).toUpperCase() + sev.slice(1)} depressive symptoms.${s >= 10 ? " Consider treatment: psychotherapy, medication, or both." : ""}`, noteText: `PHQ-9 score ${s}/27 (${sev})${si ? "; positive response to item 9, suicide risk assessment completed ***" : ""}.`, alert: si ? "Item 9 is positive. Complete a suicide risk assessment (for example, the C-SSRS) today." : undefined };
    },
  },
  {
    id: "phq2",
    name: "PHQ-2 depression screen",
    category: "Behavioral health",
    source: "Kroenke K et al. Med Care 2003;41:1284-92",
    inputs: PHQ_ITEMS.slice(0, 2).map((label, i) => ({ key: `q${i + 1}`, label, type: "select" as const, options: FREQ })),
    compute: (v) => {
      if (v.q1 === undefined || v.q2 === undefined || v.q1 === "" || v.q2 === "") return { missing: ["Both questions"] };
      const s = Number(v.q1) + Number(v.q2);
      return { value: s, display: `${s} / 6`, band: s >= 3 ? "high" : "low", interpretation: s >= 3 ? "Positive screen; complete a PHQ-9." : "Negative screen.", noteText: `PHQ-2 depression screening completed; score ${s}/6 (${s >= 3 ? "positive, PHQ-9 to follow" : "negative"}).` };
    },
  },
  {
    id: "gad7",
    name: "GAD-7 anxiety",
    category: "Behavioral health",
    source: "Spitzer RL et al. Arch Intern Med 2006;166:1092-7",
    inputs: GAD_ITEMS.map((label, i) => ({ key: `q${i + 1}`, label, type: "select" as const, options: FREQ })),
    compute: (v) => {
      const missing = GAD_ITEMS.filter((_, i) => v[`q${i + 1}`] === undefined || v[`q${i + 1}`] === "");
      if (missing.length) return { missing };
      const s = GAD_ITEMS.reduce((n, _, i) => n + Number(v[`q${i + 1}`]), 0);
      const sev = s <= 4 ? "minimal" : s <= 9 ? "mild" : s <= 14 ? "moderate" : "severe";
      return { value: s, display: `${s} / 21`, band: s >= 15 ? "high" : s >= 10 ? "moderate" : "low", interpretation: `${sev.charAt(0).toUpperCase() + sev.slice(1)} anxiety.${s >= 10 ? " Further evaluation is warranted." : ""}`, noteText: `GAD-7 score ${s}/21 (${sev} anxiety).` };
    },
  },
  {
    id: "bmi",
    name: "Body mass index",
    category: "General",
    source: "CDC adult BMI categories",
    inputs: [{ key: "weight", label: "Weight", type: "number", unit: "lb", min: 2, max: 1000, step: 0.1 }, { key: "height", label: "Height", type: "number", unit: "in", min: 20, max: 100, step: 0.1 }],
    compute: (v) => {
      const m = need(v, [["weight", "Weight"], ["height", "Height"]]);
      if (m) return m;
      const b = round((703 * num(v, "weight")!) / num(v, "height")! ** 2, 1);
      const cat = b < 18.5 ? "underweight" : b < 25 ? "healthy weight" : b < 30 ? "overweight" : b < 40 ? "obesity" : "severe obesity";
      return { value: b, display: `${b} kg/m²`, band: b >= 30 || b < 18.5 ? "high" : b >= 25 ? "moderate" : "low", interpretation: `${cat.charAt(0).toUpperCase() + cat.slice(1)}.`, noteText: `BMI ${b} kg/m² (${cat}).` };
    },
  },
  {
    id: "peds_dose",
    name: "Pediatric weight-based dosing",
    category: "Pediatrics",
    source: "Standard pediatric dosing references (for example, AAP Red Book and Lexicomp); verify before prescribing",
    inputs: [{ key: "weight", label: "Weight", type: "number", unit: "kg", min: 1, max: 150, step: 0.1 }, { key: "drug", label: "Medication", type: "select", options: Object.entries(DRUGS).map(([value, d]) => ({ value, label: d.label })) }],
    compute: (v) => {
      const m = need(v, [["weight", "Weight"]]);
      if (m) return m;
      const d = DRUGS[String(v.drug ?? "")];
      if (!d) return { missing: ["Medication"] };
      const w = num(v, "weight")!;
      const raw = d.mgPerKg * w;
      const dose = Math.min(raw, d.maxDose, d.maxDay / d.perDay);
      const capped = dose < raw;
      const ml = round(dose / d.mgPerMl, 1);
      return { value: round(dose), display: `${round(dose)} mg per dose (${ml} mL of ${d.concentration})`, band: capped ? "moderate" : "low", interpretation: `${d.label}: ${d.mgPerKg} mg/kg per dose, ${d.freq}.${capped ? " Capped at the adult maximum." : ""}`, noteText: `${d.label.replace(/ \(.*\)$/, "")} ${round(dose)} mg (${ml} mL of ${d.concentration}) ${d.freq}, based on weight ${w} kg.` };
    },
  },
];

export interface CalcContext {
  patient: { dob: string; sex: string; chart: Chart } | null;
  facts: Facts | null;
  at: Date;
}

const hasDx = (chart: Chart | undefined, re: RegExp) => !!chart?.problems.some((p) => re.test(p.icd10 ?? "") || re.test(p.name));

function labValue(chart: Chart | undefined, facts: Facts | null, re: RegExp) {
  const f = facts?.results.find((r) => re.test(r.name));
  const raw = f?.value ?? [...(chart?.labs ?? [])].filter((l) => re.test(l.name)).sort((a, b) => b.date.localeCompare(a.date))[0]?.value;
  const n = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function prefill(calcId: string, ctx: CalcContext): { values: CalcValues; sources: Record<string, string> } {
  const chart = ctx.patient?.chart;
  const values: CalcValues = {};
  const sources: Record<string, string> = {};
  const set = (k: string, v: number | boolean | string | null | undefined, src: string) => {
    if (v === null || v === undefined || v === false) return;
    values[k] = v;
    sources[k] = src;
  };
  const age = ctx.patient ? ageFrom(ctx.patient.dob, ctx.at) : null;
  set("age", age, "chart");
  if (ctx.patient?.sex === "F" || ctx.patient?.sex === "M") set("sex", ctx.patient.sex, "chart");
  if (calcId === "egfr") set("scr", labValue(chart, ctx.facts, /creatinine/i), "labs");
  if (calcId === "cha2ds2vasc") {
    set("chf", hasDx(chart, /^I50|heart failure/i), "problem list");
    set("htn", hasDx(chart, /^I1[0-6]|hypertension/i), "problem list");
    set("diabetes", hasDx(chart, /^E1[01]|diabetes/i), "problem list");
    set("stroke", hasDx(chart, /^I63|^G45|^Z86\.73|\bstroke\b|\bTIA\b|transient ischemic/i), "problem list");
    set("vascular", hasDx(chart, /^I2[1-5]|^I70|^I73|myocardial infarction|coronary|peripheral arter/i), "problem list");
  }
  if (calcId === "hasbled") {
    set("elderly", age !== null && age > 65, "chart");
    set("stroke", hasDx(chart, /^I63|stroke/i), "problem list");
    set("drugs", !!chart?.medications.some((m) => /aspirin|clopidogrel|ibuprofen|naproxen|meloxicam|diclofenac/i.test(m.name)), "medication list");
    set("renal", (labValue(chart, ctx.facts, /creatinine/i) ?? 0) >= 2.26, "labs");
  }
  if (calcId === "curb65") {
    set("age65", age !== null && age >= 65, "chart");
    const bp = ctx.facts?.vitals.find((x) => x.name === "BP")?.value;
    const m = bp ? /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(bp) : null;
    if (m) set("bp", Number(m[1]) < 90 || Number(m[2]) <= 60, "visit");
    const rr = ctx.facts?.vitals.find((x) => x.name === "RR")?.value;
    if (rr) set("rr", Number.parseFloat(rr) >= 30, "visit");
    const bun = labValue(chart, ctx.facts, /\bBUN\b|urea nitrogen/i);
    if (bun !== null) set("bun", bun > 19, "labs");
  }
  if (calcId === "centor") {
    const t = ctx.facts?.vitals.find((x) => x.name === "Temp")?.value;
    if (t) {
      const n = Number.parseFloat(t);
      set("fever", n > 38 && n < 45 ? true : n > 100.4, "visit");
    }
    const cough = ctx.facts?.symptoms.find((s) => s.key === "cough");
    if (cough) set("nocough", cough.negated, "visit");
  }
  if (calcId === "wells_pe") {
    const hr = ctx.facts?.vitals.find((x) => x.name === "HR")?.value;
    if (hr) set("hr", Number.parseFloat(hr) > 100, "visit");
    set("cancer", hasDx(chart, /^C\d|cancer|malignan/i), "problem list");
    set("prior", hasDx(chart, /^I26|^I82|^Z86\.71|embolism|deep vein/i), "problem list");
  }
  if (calcId === "bmi" || calcId === "peds_dose") {
    const w = ctx.facts?.vitals.find((x) => x.name === "Weight")?.value ?? chart?.vitals?.Weight;
    const wm = w ? /([\d.]+)\s*(kg|lb|lbs|pounds)?/i.exec(w) : null;
    if (wm) {
      const n = Number(wm[1]);
      const kg = /kg/i.test(wm[2] ?? "") ? n : n / 2.2046;
      set("weight", calcId === "bmi" ? round(/kg/i.test(wm[2] ?? "") ? n * 2.2046 : n, 1) : round(kg, 1), "vitals");
    }
    const h = chart?.vitals?.Height;
    const hm = h ? /(\d+)\s*(?:ft|')\s*(\d+)?|([\d.]+)\s*(in|cm)/i.exec(h) : null;
    if (hm && calcId === "bmi") set("height", hm[1] ? Number(hm[1]) * 12 + Number(hm[2] ?? 0) : hm[4]?.toLowerCase() === "cm" ? round(Number(hm[3]) / 2.54, 1) : Number(hm[3]), "vitals");
  }
  return { values, sources };
}

export function suggestedCalculators(ctx: CalcContext) {
  const chart = ctx.patient?.chart;
  const age = ctx.patient ? ageFrom(ctx.patient.dob, ctx.at) : 40;
  const out = new Set<string>();
  if (hasDx(chart, /^I48|atrial fib/i)) out.add("cha2ds2vasc").add("hasbled");
  if (hasDx(chart, /^E1[01]|^N18|diabetes|kidney/i) || (chart?.labs ?? []).some((l) => /creatinine|egfr/i.test(l.name))) out.add("egfr");
  if (ctx.facts?.symptoms.some((s) => !s.negated && /sore_throat/.test(s.key))) out.add("centor");
  if (ctx.facts?.problems.some((p) => /pneumonia/i.test(p.label))) out.add("curb65");
  if (hasDx(chart, /^F3[23]|^F41|depress|anxiety/i) || ctx.facts?.problems.some((p) => /depress|anxiety/i.test(p.label))) out.add("phq9").add("gad7");
  if (age < 18) out.add("peds_dose");
  return [...out];
}
