import type { ProcedureFacts } from "./procedures";
import { EVALS, type Discipline, type TherapyFacts } from "./therapy";
import { psychotherapyCode } from "./behavioral";
import type { Chart, CodeSuggestion, CodingResult, MdmElement } from "../types";
import type { Facts } from "./extract";

const LEVELS: MdmElement["level"][] = ["straightforward", "low", "moderate", "high"];
const rank = (l: MdmElement["level"]) => LEVELS.indexOf(l);

const SYSTEMIC_ACUTE = new Set(["pneumonia", "flu", "covid"]);
const ACUTE_COMPLICATED = new Set(["lbp", "ankle_sprain"]);

export interface CodingContext {
  patientType: "new" | "established";
  minutes: number;
  chart?: Chart;
  pediatric?: boolean;
  hccFor?: (icd10: string) => { hcc: string; label: string }[];
  encounterClass?: "office" | "initial_inpatient" | "subsequent_inpatient" | "discharge" | "ed";
  psychotherapy?: "standalone" | "intake" | "addon" | "group";
  psychotherapyMinutes?: { minutes: number; evidence: string[] } | null;
  therapy?: { discipline: Discipline; facts: TherapyFacts };
  procedures?: ProcedureFacts;
  oncology?: { cancer: { code: string; label: string; evidence: string[] } | null; monitoring: string[]; sideEffects: { label: string; code?: string; grade: number; evidence: string[] }[]; progression: string[] | null };
}

function lift(el: MdmElement, l: MdmElement["level"], why: string, ev: string[]): MdmElement {
  return rank(l) > rank(el.level) ? { level: l, reasons: [why, ...el.reasons], evidence: [...ev.slice(0, 2), ...el.evidence] } : { ...el, reasons: [...el.reasons, why] };
}

function problemsElement(facts: Facts, ctx?: CodingContext): MdmElement {
  const reasons: string[] = [];
  const evidence: string[] = [];
  let level: MdmElement["level"] = "straightforward";
  const bump = (l: MdmElement["level"], why: string, ev: string[]) => {
    reasons.push(why);
    evidence.push(...ev.slice(0, 2));
    if (rank(l) > rank(level)) level = l;
  };
  const siPositive = facts.symptoms.some((s) => s.key === "si" && !s.negated);
  if (siPositive) bump("high", "Acute threat to bodily function or life (suicidal ideation)", facts.symptoms.find((s) => s.key === "si")!.evidence);
  const chronic = facts.problems.filter((p) => p.chronic && !p.fromSymptom);
  const worsening = chronic.filter((p) => p.status === "not at goal" || p.status === "worsening");
  const onChart = (key: string, label: string) => (ctx?.chart?.problems ?? []).some((cp) => cp.name.toLowerCase().includes(label.split(",")[0].toLowerCase().split(" ").slice(-1)[0]) || cp.name.toLowerCase().includes(key));
  const newlyDx = chronic.filter((p) => !worsening.includes(p) && !onChart(p.key, p.label) && facts.symptoms.some((s) => !s.negated));
  for (const p of newlyDx) bump("moderate", `New chronic illness diagnosed with active symptoms: ${p.label}`, p.evidence);
  const stable = chronic.filter((p) => !worsening.includes(p) && !newlyDx.includes(p));
  for (const p of worsening) bump("moderate", `Chronic illness with exacerbation/progression: ${p.label}`, p.evidence);
  if (stable.length >= 2) bump("moderate", `Two or more stable chronic illnesses (${stable.map((p) => p.label).join(", ")})`, stable.flatMap((p) => p.evidence));
  else if (stable.length === 1) bump("low", `One stable chronic illness: ${stable[0].label}`, stable[0].evidence);
  const acute = facts.problems.filter((p) => !p.chronic);
  const hasFever = facts.symptoms.some((s) => s.key === "fever" && !s.negated);
  for (const p of acute) {
    if (SYSTEMIC_ACUTE.has(p.key) || (hasFever && p.key === "aom" && facts.meds.some((m) => m.action === "start" && m.rx)))
      bump("moderate", `Acute illness with systemic symptoms: ${p.label}`, p.evidence);
    else if (ACUTE_COMPLICATED.has(p.key) && /sciatica|radiat/i.test(p.label + p.plan.map((x) => x.text).join(" ")))
      bump("moderate", `Acute complicated injury or undiagnosed new problem with uncertain prognosis: ${p.label}`, p.evidence);
    else if (p.fromSymptom) bump("low", `Acute uncomplicated illness or injury: ${p.label}`, p.evidence);
    else bump("low", `Acute uncomplicated illness: ${p.label}`, p.evidence);
  }
  if (!facts.problems.length) reasons.push("No problems identified");
  return { level, reasons, evidence };
}

function dataElement(facts: Facts, ctx: CodingContext): MdmElement {
  const reasons: string[] = [];
  const evidence: string[] = [];
  const tests = facts.orders.filter((o) => o.kind === "lab" || o.kind === "imaging" || (o.kind === "procedure" && /ECG/.test(o.name)));
  const reviewed = facts.results;
  const uniqueTests = new Set([...tests.map((t) => t.name), ...reviewed.map((r) => r.name)]);
  for (const t of tests) {
    reasons.push(`Ordered ${t.name}`);
    evidence.push(...t.evidence);
  }
  for (const r of reviewed) {
    reasons.push(`Reviewed ${r.name} (${r.value})`);
    evidence.push(...r.evidence);
  }
  const historian = !!ctx.pediatric;
  if (historian) reasons.push("Assessment requiring an independent historian (parent)");
  const cat1 = uniqueTests.size + (historian ? 1 : 0);
  let level: MdmElement["level"] = "straightforward";
  if (cat1 >= 3) level = "moderate";
  else if (cat1 >= 2 || historian) level = "low";
  if (!reasons.length) reasons.push("Minimal or no data reviewed or ordered");
  return { level, reasons, evidence };
}

function riskElement(facts: Facts): MdmElement {
  const reasons: string[] = [];
  const evidence: string[] = [];
  let level: MdmElement["level"] = "straightforward";
  const rxManaged = facts.meds.filter((m) => m.rx && !m.cancelled && ["start", "stop", "increase", "decrease", "change", "continue", "refill"].includes(m.action));
  if (rxManaged.length) {
    level = "moderate";
    reasons.push(`Prescription drug management (${Array.from(new Set(rxManaged.map((m) => m.name))).join(", ")})`);
    evidence.push(...rxManaged.flatMap((m) => m.evidence));
  }
  const otc = facts.meds.filter((m) => !m.rx && ["start", "continue", "taking"].includes(m.action));
  if (!rxManaged.length && otc.length) {
    level = "low";
    reasons.push(`Over-the-counter drug recommendations (${otc.map((m) => m.name).join(", ")})`);
    evidence.push(...otc.flatMap((m) => m.evidence));
  }
  const sdoh = facts.problems.filter((p) => p.def?.sdoh);
  const costPlan = facts.problems.flatMap((p) => p.plan).filter((x) => /\b(?:cheaper|generic|\$4|lower[- ]cost|afford\w*|coupon|patient assistance|samples?|GoodRx|social work\w*|food (?:bank|pantry)|community resources?|transportation (?:benefit|service)|ride service|mail[- ]order)\b/i.test(x.text));
  if (sdoh.length && (costPlan.length || rxManaged.length)) {
    if (rank("moderate") > rank(level)) level = "moderate";
    reasons.push(`Diagnosis or treatment significantly limited by social determinants of health (${sdoh.map((p) => p.label.toLowerCase()).join(", ")})`);
    evidence.push(...sdoh.flatMap((p) => p.evidence).slice(0, 2), ...costPlan.flatMap((x) => x.evidence ?? []).slice(0, 2));
  }
  if (facts.symptoms.some((s) => s.key === "si" && !s.negated)) {
    level = "high";
    reasons.push("Decision regarding hospitalization or escalation of care");
  }
  if (!reasons.length) {
    reasons.push(facts.counseling.length ? "Minimal risk: supportive care and counseling only" : "Minimal risk of morbidity from additional testing or treatment");
    if (facts.counseling.length) level = "low";
    evidence.push(...facts.counseling.flatMap((c) => c.evidence));
  }
  return { level, reasons, evidence };
}

const EM = {
  established: { straightforward: "99212", low: "99213", moderate: "99214", high: "99215" },
  new: { straightforward: "99202", low: "99203", moderate: "99204", high: "99205" },
  initial_inpatient: { straightforward: "99221", low: "99221", moderate: "99222", high: "99223" },
  subsequent_inpatient: { straightforward: "99231", low: "99231", moderate: "99232", high: "99233" },
  ed: { straightforward: "99282", low: "99283", moderate: "99284", high: "99285" },
} as const;

const INPATIENT_TIME = {
  initial_inpatient: [[40, "99221"], [55, "99222"], [75, "99223"]],
  subsequent_inpatient: [[25, "99231"], [35, "99232"], [50, "99233"]],
} as const;

function timeCode(type: "new" | "established", minutes: number) {
  const table = type === "new"
    ? [[15, "99202"], [30, "99203"], [45, "99204"], [60, "99205"]]
    : [[10, "99212"], [20, "99213"], [30, "99214"], [40, "99215"]];
  let code: string | null = null;
  for (const [min, c] of table) if (minutes >= (min as number)) code = c as string;
  return code;
}

export function computeCoding(facts: Facts, ctx: CodingContext): CodingResult {
  const diagnoses: CodeSuggestion[] = facts.problems.map((p) => ({
    code: p.icd10,
    system: "ICD-10-CM",
    label: p.label,
    rationale: p.fromSymptom
      ? "Symptom-level code; no definitive diagnosis was stated"
      : `${p.chronic ? "Chronic condition" : "Acute condition"} addressed this visit${p.status ? ` (${p.status})` : ""}${p.plan.length ? `; ${p.plan.filter((x) => x.type !== "reasoning").length} plan action(s)` : ""}`,
    evidence: p.evidence.slice(0, 4),
    confidence: p.fromSymptom ? 0.65 : p.plan.length ? 0.95 : 0.8,
    problem: p.key,
  }));

  let problems = problemsElement(facts, ctx);
  const data = dataElement(facts, ctx);
  let risk = riskElement(facts);
  const onc = ctx.oncology;
  if (onc) {
    const severe = onc.sideEffects.filter((x) => x.grade >= 2);
    if (onc.cancer && (severe.length || onc.progression)) problems = lift(problems, "high", `Chronic illness with ${onc.progression ? "progression" : "side effects of treatment"}: ${onc.cancer.label}${severe.length ? ` (${severe.map((x) => `grade ${x.grade} ${x.label.toLowerCase()}`).join(", ")})` : ""}`, [...onc.cancer.evidence, ...(onc.progression ?? []), ...severe.flatMap((x) => x.evidence)]);
    else if (onc.cancer) problems = lift(problems, "moderate", `Chronic illness under active treatment: ${onc.cancer.label}`, onc.cancer.evidence);
    if (onc.monitoring.length) risk = lift(risk, "high", "Drug therapy requiring intensive monitoring for toxicity (antineoplastic therapy with laboratory monitoring)", onc.monitoring);
    const sameSite = onc.cancer ? diagnoses.find((d) => d.code.slice(0, 3) === onc.cancer!.code.slice(0, 3)) : undefined;
    if (sameSite && onc.cancer && onc.cancer.code !== sameSite.code && (onc.cancer.code.length > sameSite.code.length || /9$/.test(sameSite.code))) Object.assign(sameSite, { code: onc.cancer.code, label: onc.cancer.label });
    if (onc.cancer && !sameSite) diagnoses.unshift({ code: onc.cancer.code, system: "ICD-10-CM", label: onc.cancer.label, rationale: "Malignancy under active treatment", evidence: onc.cancer.evidence.slice(0, 4), confidence: 0.95, problem: "cancer" });
    for (const x of severe.length ? onc.sideEffects : []) if (x.code && !diagnoses.some((d) => d.code === x.code)) diagnoses.push({ code: x.code, system: "ICD-10-CM", label: x.label, rationale: `Grade ${x.grade} treatment toxicity (CTCAE v5.0)`, evidence: x.evidence.slice(0, 4), confidence: 0.85, problem: "toxicity" });
    if (severe.length && !diagnoses.some((d) => d.code === "T45.1X5A")) diagnoses.push({ code: "T45.1X5A", system: "ICD-10-CM", label: "Adverse effect of antineoplastic and immunosuppressive drugs, initial encounter", rationale: "Sequenced after the manifestation codes for chemotherapy toxicity", evidence: severe.flatMap((x) => x.evidence).slice(0, 4), confidence: 0.85, problem: "toxicity" });
  }
  const levels = [problems.level, data.level, risk.level].sort((a, b) => rank(b) - rank(a));
  const level = levels[1];
  const cls = ctx.encounterClass ?? "office";
  const psych = ctx.psychotherapy === "group" ? "90853" : ctx.psychotherapy === "intake" ? "90791" : ctx.psychotherapy === "standalone" ? (ctx.minutes >= 53 ? "90837" : ctx.minutes >= 38 ? "90834" : ctx.minutes >= 16 ? "90832" : "90832") : null;
  const th = ctx.therapy;
  const evalCode = th?.facts.evaluation ? (th.facts.evaluation.kind === "re" ? EVALS[th.discipline].re : EVALS[th.discipline][th.facts.evaluation.complexity]) : null;
  const therapyCode = th ? evalCode ?? th.facts.services.find((x) => !x.bundled)?.cpt ?? "97110" : null;
  const code = therapyCode ?? psych ?? (cls === "discharge" ? (ctx.minutes > 30 ? "99239" : "99238") : cls === "office" ? EM[ctx.patientType][level] : EM[cls][level]);
  let tc: string | null = null;
  if (psych || therapyCode || ctx.psychotherapy === "addon") tc = null;
  else if (cls === "office") tc = ctx.minutes > 0 ? timeCode(ctx.patientType, ctx.minutes) : null;
  else if (cls === "initial_inpatient" || cls === "subsequent_inpatient") for (const [min, c] of INPATIENT_TIME[cls]) if (ctx.minutes >= min) tc = c;

  const notes: string[] = [];
  let score = 100;
  const lowMargin = [problems, data, risk].filter((e) => e.level === level).length === 1 && rank(levels[0]) > rank(level);
  for (const [name, el] of [["Problems", problems], ["Data", data], ["Risk", risk]] as const) {
    if (rank(el.level) >= rank(level) && !el.evidence.length) {
      score -= 25;
      notes.push(`${name} element supports ${level} but has no linked conversation evidence.`);
    }
  }
  if (lowMargin) notes.push(`Level is set by the second-highest element; two of three elements meet ${level}.`);
  const fromSymptomOnly = facts.problems.length > 0 && facts.problems.every((p) => p.fromSymptom);
  if (fromSymptomOnly && rank(level) >= 2) {
    score -= 20;
    notes.push("Only symptom-level diagnoses support a moderate level; document the working diagnosis.");
  }
  let direction: "under" | "balanced" | "over" = "balanced";
  if (tc && tc > code && ctx.minutes >= 20) {
    direction = "under";
    notes.push(`Recorded time (${ctx.minutes} min) supports ${tc} if total time on the date is documented.`);
  }
  if (score < 70) direction = "over";
  if (!notes.length) notes.push("Every MDM element is linked to transcript evidence.");

  const hcc: CodeSuggestion[] = [];
  const cdi: CodingResult["cdi"] = [];
  for (const p of facts.problems) {
    const mapped = ctx.hccFor ? ctx.hccFor(p.icd10) : [];
    for (const m of mapped) {
      const meat = { monitor: p.evidence.length > 0, evaluate: facts.results.length > 0, assess: !!p.status || p.plan.some((x) => x.type === "reasoning"), treat: p.plan.some((x) => x.type === "medication" || x.type === "order") };
      const met = Object.entries(meat).filter(([, v]) => v).map(([k]) => k.toUpperCase());
      hcc.push({ code: m.hcc, system: "CMS-HCC V28", label: `${m.label} (${p.icd10})`, rationale: `MEAT support: ${met.join(", ") || "none"}`, evidence: p.evidence.slice(0, 3), confidence: met.length >= 2 ? 0.9 : 0.5, problem: p.key });
      if (met.length < 2) cdi.push({ problem: p.key, message: `${p.label} maps to ${m.hcc} (${m.label}) but lacks MEAT documentation (monitor, evaluate, assess, treat).`, evidence: p.evidence.slice(0, 2) });
    }
    if (p.def?.cdi && (p.icd10 === p.def.icd10 || /\.9$/.test(p.icd10))) cdi.push({ problem: p.key, message: p.def.cdi, evidence: p.evidence.slice(0, 2) });
    if (/unspecified (?:side|ear)/i.test(p.label)) cdi.push({ problem: p.key, message: `Document laterality for ${p.label.split(",")[0].toLowerCase()} to use a specific code.`, evidence: p.evidence.slice(0, 2) });
  }
  const bmi = facts.vitals.find((v) => v.name === "BMI")?.value ?? ctx.chart?.vitals?.BMI;
  if (bmi && Number.parseFloat(bmi) >= 30 && !facts.problems.some((p) => p.key === "obesity")) {
    cdi.push({ problem: "obesity", message: `BMI ${bmi} is on file without an obesity diagnosis; if clinically appropriate, document obesity (E66.9) with BMI Z-code (Z68.3x).`, evidence: [] });
  }

  return {
    diagnoses,
    em: { code, level, patientType: ctx.patientType, problems, data, risk, timeBased: tc ? { minutes: ctx.minutes, code: tc } : undefined, auditRisk: { score: Math.max(0, score), direction, notes } },
    procedures: ctx.procedures?.procedures.length || ctx.procedures?.drugs.length ? { procedures: ctx.procedures.procedures, drugs: ctx.procedures.drugs } : undefined,
    therapy: th ? { discipline: th.discipline, evalCode, services: th.facts.services } : undefined,
    psychotherapyAddOn: ctx.psychotherapy === "addon" && ctx.psychotherapyMinutes && ctx.psychotherapyMinutes.minutes >= 16 ? { code: psychotherapyCode(ctx.psychotherapyMinutes.minutes, true)!, minutes: ctx.psychotherapyMinutes.minutes, evidence: ctx.psychotherapyMinutes.evidence } : undefined,
    hcc,
    cdi,
  };
}
