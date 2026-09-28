import type { Chart, Patient, StagedOrder, Utterance } from "../types";
import type { Facts } from "./extract";
import { ageFrom } from "./text";
import { cms117, dueLabel, immunizationGaps } from "./immunizations";

export type MeasureStatus = "met" | "gap" | "addressed" | "excluded";

export interface MeasureAction {
  kind: "order" | "insert";
  label: string;
  order?: { kind: StagedOrder["kind"]; name: string; detail: string };
  text?: string;
}

export interface MeasureResult {
  id: string;
  ecqm: string;
  title: string;
  status: MeasureStatus;
  reason: string;
  evidence: string[];
  actions: MeasureAction[];
  inverse?: boolean;
}

export interface MeasureDef {
  id: string;
  ecqm: string;
  title: string;
  population: string;
  inverse?: boolean;
}

export const MEASURES: MeasureDef[] = [
  { id: "dm_a1c", ecqm: "CMS122", title: "Diabetes: HbA1c poor control (>9%)", population: "Ages 18 to 75 with diabetes", inverse: true },
  { id: "htn_bp", ecqm: "CMS165", title: "Controlling high blood pressure", population: "Ages 18 to 85 with hypertension" },
  { id: "depression", ecqm: "CMS2", title: "Depression screening and follow-up plan", population: "Ages 12 and older" },
  { id: "tobacco", ecqm: "CMS138", title: "Tobacco use: screening and cessation intervention", population: "Ages 12 and older" },
  { id: "bmi", ecqm: "CMS69", title: "BMI screening and follow-up plan", population: "Ages 18 and older" },
  { id: "breast", ecqm: "CMS125", title: "Breast cancer screening", population: "Women ages 52 to 74" },
  { id: "colorectal", ecqm: "CMS130", title: "Colorectal cancer screening", population: "Ages 46 to 75" },
  { id: "flu", ecqm: "CMS147", title: "Influenza immunization", population: "Ages 6 months and older, October to March" },
  { id: "statin", ecqm: "CMS347", title: "Statin therapy for cardiovascular disease prevention", population: "Ages 40 to 75 with diabetes" },
  { id: "kidney", ecqm: "CMS951", title: "Kidney health evaluation", population: "Ages 18 to 85 with diabetes" },
  { id: "child_imm", ecqm: "CMS117", title: "Childhood immunization status", population: "Children turning 2" },
  { id: "peds_catchup", ecqm: "CDC", title: "Immunizations due on the CDC schedule", population: "Ages 0 to 18" },
  { id: "falls", ecqm: "CMS139", title: "Falls: screening for future fall risk", population: "Ages 65 and older" },
];

export interface QualityInput {
  patient: Pick<Patient, "dob" | "sex"> & { chart: Chart };
  facts: Facts | null;
  utterances: Utterance[];
  orders: StagedOrder[];
  at: Date;
  noteLines?: string[];
}

const within = (date: string | undefined, at: Date, days: number) => {
  if (!date) return false;
  const t = new Date(`${date.slice(0, 10)}T12:00:00`).getTime();
  return t <= at.getTime() + 86400000 && at.getTime() - t <= days * 86400000;
};

const hasProblem = (chart: Chart, facts: Facts | null, re: RegExp) => chart.problems.some((p) => re.test(p.icd10 ?? "") || re.test(p.name)) || !!facts?.problems.some((p) => re.test(p.icd10));

function said(utts: Utterance[], re: RegExp, speaker?: Utterance["speaker"]) {
  return utts.filter((u) => (!speaker || u.speaker === speaker) && re.test(u.text)).map((u) => u.id);
}

function ordered(orders: StagedOrder[], re: RegExp) {
  return orders.find((o) => o.status !== "rejected" && re.test(o.name));
}

function bpOf(facts: Facts | null, chart: Chart) {
  const v = facts?.vitals.find((x) => x.name === "BP");
  const raw = v?.value ?? chart.vitals?.BP;
  const m = raw ? /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(raw) : null;
  return m ? { sys: Number(m[1]), dia: Number(m[2]), evidence: v?.evidence ?? ["chart"], raw: `${m[1]}/${m[2]}` } : null;
}

function lab(chart: Chart, facts: Facts | null, re: RegExp) {
  const f = facts?.results.find((r) => re.test(r.name));
  if (f) return { value: f.value, date: null as string | null, evidence: f.evidence };
  const l = [...(chart.labs ?? [])].filter((x) => re.test(x.name)).sort((a, b) => b.date.localeCompare(a.date))[0];
  return l ? { value: l.value, date: l.date, evidence: ["chart"] } : null;
}

export function evaluateQuality(input: QualityInput): MeasureResult[] {
  const { patient, facts, utterances: utts, orders, at } = input;
  const lines = (input.noteLines ?? []).filter((l) => !l.includes("***"));
  const noted = (re: RegExp) => lines.some((l) => re.test(l));
  const chart = patient.chart;
  const age = ageFrom(patient.dob, at);
  const out: MeasureResult[] = [];
  const push = (id: string, r: Omit<MeasureResult, "id" | "ecqm" | "title" | "inverse">) => {
    const m = MEASURES.find((x) => x.id === id)!;
    out.push({ id, ecqm: m.ecqm, title: m.title, inverse: m.inverse, ...r });
  };
  const diabetes = hasProblem(chart, facts, /^E1[01]|diabetes/i);
  const hospice = hasProblem(chart, facts, /^Z51\.5|hospice|palliative/i);
  const screenings = chart.screenings ?? [];
  const screened = (re: RegExp, days: number) => screenings.find((s) => re.test(s.name) && within(s.date, at, days));

  if (diabetes && age >= 18 && age <= 75 && !hospice) {
    const a1c = lab(chart, facts, /a1c/i);
    const val = a1c ? Number.parseFloat(a1c.value) : NaN;
    const recent = a1c && (a1c.date === null || within(a1c.date, at, 365));
    const ord = ordered(orders, /a1c/i);
    if (recent && val <= 9) push("dm_a1c", { status: "met", reason: `Most recent HbA1c ${a1c!.value} is at or below 9%.`, evidence: a1c!.evidence, actions: [] });
    else if (ord) push("dm_a1c", { status: "addressed", reason: recent ? `HbA1c ${a1c!.value} is above 9%; repeat ordered today.` : "No HbA1c this year; ordered today.", evidence: ord.evidence, actions: [] });
    else push("dm_a1c", { status: "gap", reason: recent ? `HbA1c ${a1c!.value} is above 9%. The measure counts this as poor control until a lower result is on file.` : "No HbA1c result in the last 12 months.", evidence: a1c?.evidence ?? [], actions: [{ kind: "order", label: "Order HbA1c", order: { kind: "lab", name: "Hemoglobin A1c", detail: "Quality measure CMS122" } }] });
  }

  if (hasProblem(chart, facts, /^I1[0-6]|hypertension/i) && age >= 18 && age <= 85 && !hospice) {
    const bp = bpOf(facts, chart);
    if (noted(/repeat blood pressure \d{2,3}\/\d{2,3}/i)) push("htn_bp", { status: "met", reason: "Repeat blood pressure documented in the note.", evidence: [], actions: [] });
    else if (!bp) push("htn_bp", { status: "gap", reason: "No blood pressure recorded at this visit.", evidence: [], actions: [{ kind: "insert", label: "Add BP to note", text: "Blood pressure ***/*** mmHg." }] });
    else if (bp.sys < 140 && bp.dia < 90) push("htn_bp", { status: "met", reason: `BP ${bp.raw} is below 140/90.`, evidence: bp.evidence, actions: [] });
    else {
      const plan = facts?.meds.some((m) => ["start", "increase", "change"].includes(m.action) && /ACE|ARB|calcium|thiazide|beta/i.test(m.cls));
      push("htn_bp", { status: plan ? "addressed" : "gap", reason: plan ? `BP ${bp.raw} is above goal; antihypertensive therapy adjusted today. The measure uses the last BP of the year.` : `BP ${bp.raw} is at or above 140/90 with no treatment change documented.`, evidence: bp.evidence, actions: plan ? [] : [{ kind: "insert", label: "Document recheck", text: `Repeat blood pressure ***/*** mmHg after 5 minutes of rest.` }] });
    }
  }

  if (age >= 12) {
    const asked = said(utts, /\b(?:little interest or pleasure|feeling (?:down|depressed|hopeless)|phq-?[29]|depress(?:ed|ion) screen)/i, "clinician");
    const onFile = screened(/phq|depression/i, 365);
    const mdd = hasProblem(chart, facts, /^F3[23]|bipolar|^F31/i);
    if (mdd) push("depression", { status: "excluded", reason: "Existing depression or bipolar diagnosis excludes the patient.", evidence: [], actions: [] });
    else if (noted(/phq-?[29].*\b\d{1,2}\b/i)) push("depression", { status: "met", reason: "PHQ result documented in the note.", evidence: [], actions: [] });
    else if (asked.length || onFile) push("depression", { status: "met", reason: asked.length ? "Depression screening questions were asked during the visit." : `PHQ screen on file (${onFile!.date}).`, evidence: asked.length ? asked : ["chart"], actions: [] });
    else push("depression", { status: "gap", reason: "No depression screening in the last 12 months.", evidence: [], actions: [{ kind: "insert", label: "Add PHQ-2 result", text: "PHQ-2 depression screening completed; score ***/6." }] });
  }

  if (age >= 12) {
    const asked = said(utts, /\b(?:do you (?:smoke|vape|use tobacco)|smok\w*|tobacco|cigarette|vap(?:e|ing))\b/i);
    const current = (facts?.social ?? []).some((s) => /\bsmokes?\b|pack|cigarette|vapes?\b/i.test(s.text) && !/never|quit|don't/i.test(s.text)) || chart.smoking === "current";
    const counseled = noted(/counseled on tobacco cessation/i) || !!facts?.counseling.some((c) => /quit|stop smoking|cessation/i.test(c.text)) || !!facts?.meds.some((m) => /varenicline|bupropion|nicotine/i.test(m.name) && m.action === "start");
    if (!asked.length && !chart.smoking && !noted(/tobacco use screened/i)) push("tobacco", { status: "gap", reason: "Tobacco use was not asked about.", evidence: [], actions: [{ kind: "insert", label: "Document tobacco status", text: "Tobacco use screened: ***." }] });
    else if (current && !counseled) push("tobacco", { status: "gap", reason: "Current tobacco user without a documented cessation intervention.", evidence: asked, actions: [{ kind: "insert", label: "Add cessation counseling", text: "Counseled on tobacco cessation for *** minutes; discussed pharmacotherapy and 1-800-QUIT-NOW." }] });
    else push("tobacco", { status: "met", reason: current ? "Current tobacco user; cessation intervention documented." : "Screened for tobacco use.", evidence: asked, actions: [] });
  }

  if (age >= 18) {
    const bmiRaw = facts?.vitals.find((v) => v.name === "BMI")?.value ?? chart.vitals?.BMI ?? lines.map((l) => /\bBMI (\d{2}(?:\.\d)?)/.exec(l)?.[1]).find(Boolean);
    const bmi = bmiRaw ? Number.parseFloat(bmiRaw) : NaN;
    if (!Number.isFinite(bmi)) push("bmi", { status: "gap", reason: "No BMI documented.", evidence: [], actions: [{ kind: "insert", label: "Add BMI", text: "BMI ***." }] });
    else if (bmi >= 18.5 && bmi < 25) push("bmi", { status: "met", reason: `BMI ${bmi} is in the normal range.`, evidence: ["chart"], actions: [] });
    else {
      const plan = noted(/counseled on nutrition|weight loss|dietitian|physical activity/i) || !!facts?.counseling.some((c) => /weight|diet|exercise|walk|carbs|sugar/i.test(c.text)) || !!orders.find((o) => /nutrition|dietitian|weight/i.test(o.name) && o.status !== "rejected");
      push("bmi", { status: plan ? "met" : "gap", reason: plan ? `BMI ${bmi} is outside normal; a follow-up plan (diet, exercise, or referral) is documented.` : `BMI ${bmi} is outside normal with no follow-up plan.`, evidence: ["chart"], actions: plan ? [] : [{ kind: "insert", label: "Add weight plan", text: "Discussed BMI and counseled on nutrition and physical activity; goal weight loss of 5 to 10% over 6 months." }] });
    }
  }

  if (patient.sex === "F" && age >= 52 && age <= 74 && !hasProblem(chart, facts, /mastectomy|Z90\.1/i)) {
    const s = screened(/mammo/i, 820);
    const ord = ordered(orders, /mammo/i);
    push("breast", s ? { status: "met", reason: `Mammogram on ${s.date}.`, evidence: ["chart"], actions: [] } : ord ? { status: "addressed", reason: "Screening mammogram ordered today.", evidence: ord.evidence, actions: [] } : { status: "gap", reason: "No mammogram in the last 27 months.", evidence: [], actions: [{ kind: "order", label: "Order screening mammogram", order: { kind: "imaging", name: "Screening mammogram", detail: "Quality measure CMS125" } }] });
  }

  if (age >= 46 && age <= 75 && !hasProblem(chart, facts, /colorectal cancer|^C18|colectomy/i)) {
    const s = screened(/colonoscopy/i, 3650) ?? screened(/ct colonography/i, 1825) ?? screened(/cologuard|fit-?dna|stool dna/i, 1095) ?? screened(/\bfit\b|fecal immuno|fobt/i, 365);
    const ord = ordered(orders, /colonoscopy|fecal immunochemical|\bFIT\b|cologuard/i);
    push("colorectal", s ? { status: "met", reason: `${s.name} on ${s.date}.`, evidence: ["chart"], actions: [] } : ord ? { status: "addressed", reason: `${ord.name} ordered today.`, evidence: ord.evidence, actions: [] } : { status: "gap", reason: "No colorectal cancer screening on file within its interval.", evidence: [], actions: [{ kind: "order", label: "Order FIT kit", order: { kind: "lab", name: "Fecal immunochemical test (FIT)", detail: "Quality measure CMS130" } }, { kind: "order", label: "Refer for colonoscopy", order: { kind: "procedure", name: "Colonoscopy", detail: "Screening; quality measure CMS130" } }] });
  }

  const month = at.getMonth();
  if ((month >= 9 || month <= 2) && age >= 1) {
    const season = new Date(at.getFullYear() - (month <= 2 ? 1 : 0), 7, 1);
    const had = (chart.immunizations ?? []).find((i) => /influenza|flu/i.test(i.name) && new Date(i.date) >= season);
    const ord = ordered(orders, /influenza vaccine|flu vaccine/i);
    const declined = said(utts, /\b(?:don'?t|do not|won'?t) (?:want|get) (?:the |a )?flu shot|decline[sd]? (?:the )?flu/i, "patient");
    const already = said(utts, /\b(?:already|just) (?:got|had) (?:my|the|a) flu shot/i, "patient");
    push("flu", had || already.length ? { status: "met", reason: had ? `Flu vaccine given ${had.date}.` : "Patient reports receiving this season's flu vaccine.", evidence: already, actions: [] } : ord ? { status: "addressed", reason: "Flu vaccine ordered today.", evidence: ord.evidence, actions: [] } : declined.length ? { status: "excluded", reason: "Patient declined the flu vaccine (documented reason).", evidence: declined, actions: [] } : { status: "gap", reason: "No flu vaccine this season.", evidence: [], actions: [{ kind: "order", label: "Give flu vaccine", order: { kind: "vaccine", name: "Influenza vaccine, trivalent (IIV3), preservative-free", detail: "Quality measure CMS147" } }] });
  }

  if (diabetes && age >= 40 && age <= 75) {
    const onStatin = chart.medications.some((m) => /statin/i.test(m.name) || /atorva|rosuva|simva|prava|lova|pitava/i.test(m.name)) || !!facts?.meds.some((m) => m.cls === "statin" && ["start", "taking", "continue"].includes(m.action) && !m.cancelled);
    push("statin", onStatin || noted(/statin/i) ? { status: "met", reason: "On statin therapy.", evidence: ["chart"], actions: [] } : { status: "gap", reason: "Diabetes, age 40 to 75, and not on a statin.", evidence: [], actions: [{ kind: "insert", label: "Document statin plan", text: "Discussed moderate-intensity statin for primary prevention; ***." }] });
  }

  if (diabetes && age >= 18 && age <= 85) {
    const egfr = lab(chart, facts, /egfr/i);
    const uacr = lab(chart, facts, /microalbumin|albumin\/creatinine|uacr/i);
    const egfrOk = egfr && (egfr.date === null || within(egfr.date, at, 365)) || ordered(orders, /metabolic panel|creatinine|egfr/i);
    const uacrOk = uacr && (uacr.date === null || within(uacr.date, at, 365)) || ordered(orders, /microalbumin|albumin/i);
    const acts: MeasureAction[] = [];
    if (!egfrOk) acts.push({ kind: "order", label: "Order BMP (eGFR)", order: { kind: "lab", name: "Basic metabolic panel", detail: "Quality measure CMS951" } });
    if (!uacrOk) acts.push({ kind: "order", label: "Order urine albumin/creatinine", order: { kind: "lab", name: "Urine microalbumin/creatinine ratio", detail: "Quality measure CMS951" } });
    push("kidney", acts.length ? { status: "gap", reason: `Missing this year: ${[!egfrOk ? "eGFR" : "", !uacrOk ? "urine albumin-creatinine ratio" : ""].filter(Boolean).join(" and ")}.`, evidence: [], actions: acts } : { status: "met", reason: "eGFR and urine albumin-creatinine ratio are current or ordered.", evidence: [], actions: [] });
  }

  if (age >= 65) {
    const asked = said(utts, /\b(?:any falls|have you (?:had a )?fall(?:en)?|fallen|trouble with (?:your )?balance|unsteady)\b/i, "clinician");
    const onFile = screened(/fall/i, 365);
    push("falls", asked.length || onFile || noted(/falls screening: \d/i) ? { status: "met", reason: asked.length ? "Fall risk was asked about during the visit." : `Falls screen on file (${onFile!.date}).`, evidence: asked, actions: [] } : { status: "gap", reason: "No falls screening in the last 12 months.", evidence: [], actions: [{ kind: "insert", label: "Document falls screen", text: "Falls screening: *** falls in the past 12 months; balance and gait ***." }] });
  }

  if (age < 19) {
    const history = [...(chart.immunizations ?? []), ...orders.filter((o) => o.kind === "vaccine" && o.status !== "rejected").map((o) => ({ name: o.name, date: at.toISOString().slice(0, 10) }))];
    const c = cms117(patient.dob, chart.immunizations ?? [], at);
    if (c) push("child_imm", c.met ? { status: "met", reason: "All CMS117 vaccine series were complete by the second birthday.", evidence: [], actions: [] } : { status: "gap", reason: `Incomplete by the second birthday: ${c.missing.join(", ")}.`, evidence: [], actions: [] });
    const gaps = immunizationGaps(patient.dob, history, at);
    const ordered = orders.filter((o) => o.kind === "vaccine" && o.status !== "rejected");
    push("peds_catchup", gaps.length ? { status: "gap", reason: `Due or overdue: ${gaps.map(dueLabel).join("; ")}.`, evidence: [], actions: [{ kind: "insert", label: "Document catch-up plan", text: `Immunizations reviewed against the CDC schedule; due today: ${gaps.map((g) => `${g.label} #${g.dose}`).join(", ")}. Vaccine information statements provided; ***.` }] } : ordered.length ? { status: "addressed", reason: `Up to date after today's ${ordered.map((o) => o.name).join(", ")}.`, evidence: ordered.flatMap((o) => o.evidence), actions: [] } : { status: "met", reason: "Up to date on the CDC childhood schedule.", evidence: [], actions: [] });
  }

  return out;
}

export function qualitySummary(results: MeasureResult[]) {
  return { gaps: results.filter((r) => r.status === "gap").length, met: results.filter((r) => r.status === "met").length, addressed: results.filter((r) => r.status === "addressed").length, total: results.filter((r) => r.status !== "excluded").length };
}
