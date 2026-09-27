import type { Chart, CodingResult, StagedOrder } from "../types";
import type { Facts } from "./extract";

export interface ClaimDx {
  pointer: string;
  code: string;
  label: string;
}

export interface ClaimLine {
  id: string;
  cpt: string;
  description: string;
  modifiers: string[];
  pointers: string[];
  units: number;
  charge: number;
  source: "em" | "addon" | "procedure" | "lab" | "vaccine" | "vaccine_admin" | "screening" | "counseling" | "manual";
  rationale: string;
  evidence: string[];
}

export interface ClaimEdit {
  id: string;
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  lineId?: string;
}

export interface Opportunity {
  id: string;
  category: "em_level" | "addon" | "screening" | "counseling" | "hcc" | "preventive" | "specificity";
  title: string;
  detail: string;
  value: number;
  evidence: string[];
  line?: ClaimLine;
}

export interface Claim {
  placeOfService: "11" | "10" | "02";
  payer: "Medicare" | "Commercial";
  dx: ClaimDx[];
  lines: ClaimLine[];
  edits: ClaimEdit[];
  opportunities: Opportunity[];
  totals: { charges: number; lines: number };
  excludedOrders: string[];
}

export interface BillingContext {
  age: number;
  sex: "F" | "M" | "X";
  setting: "in-person" | "telehealth";
  patientType: "new" | "established";
  chart?: Chart;
  minutes: number;
  orders: StagedOrder[];
  at?: Date;
  final?: boolean;
}

export const FEE_SCHEDULE: Record<string, { fee: number; desc: string }> = {
  "99202": { fee: 75, desc: "Office visit, new patient, straightforward MDM" },
  "99203": { fee: 115, desc: "Office visit, new patient, low MDM" },
  "99204": { fee: 172, desc: "Office visit, new patient, moderate MDM" },
  "99205": { fee: 227, desc: "Office visit, new patient, high MDM" },
  "99212": { fee: 58, desc: "Office visit, established patient, straightforward MDM" },
  "99213": { fee: 93, desc: "Office visit, established patient, low MDM" },
  "99214": { fee: 132, desc: "Office visit, established patient, moderate MDM" },
  "99215": { fee: 186, desc: "Office visit, established patient, high MDM" },
  G2211: { fee: 16, desc: "Visit complexity add-on, longitudinal care" },
  "99417": { fee: 31, desc: "Prolonged office service, each 15 minutes" },
  "99395": { fee: 118, desc: "Preventive visit, established, 18-39" },
  "99396": { fee: 125, desc: "Preventive visit, established, 40-64" },
  "99397": { fee: 135, desc: "Preventive visit, established, 65+" },
  "36415": { fee: 3, desc: "Routine venipuncture" },
  "87880": { fee: 16, desc: "Rapid strep antigen (CLIA-waived)" },
  "87804": { fee: 16, desc: "Influenza antigen (CLIA-waived)" },
  "87811": { fee: 41, desc: "SARS-CoV-2 antigen (CLIA-waived)" },
  "81003": { fee: 3, desc: "Urinalysis, automated, without microscopy" },
  "83036": { fee: 13, desc: "Hemoglobin A1c" },
  "93000": { fee: 17, desc: "Electrocardiogram, 12-lead with interpretation" },
  "90686": { fee: 21, desc: "Influenza vaccine, quadrivalent, preservative-free" },
  "90715": { fee: 38, desc: "Tdap vaccine" },
  "90750": { fee: 196, desc: "Zoster vaccine, recombinant" },
  "90677": { fee: 254, desc: "Pneumococcal conjugate vaccine, 20-valent" },
  "91320": { fee: 128, desc: "COVID-19 vaccine" },
  "90471": { fee: 25, desc: "Immunization administration, first vaccine" },
  "90472": { fee: 13, desc: "Immunization administration, each additional" },
  "96127": { fee: 5, desc: "Brief emotional/behavioral assessment, scored instrument" },
  "99406": { fee: 15, desc: "Tobacco cessation counseling, 3-10 minutes" },
};

const POC_TESTS = new Set(["87880", "87804", "87811", "81003"]);
const BLOOD_LABS = new Set(["83036", "80061", "80053", "80048", "85025", "84443", "82306", "82607", "83540", "84153", "84550"]);
const NECESSITY: Record<string, RegExp> = {
  "83036": /^(E1[0-3]|R73|O24|Z13\.1|Z79\.4)/,
  "80061": /^(E78|E1[01]|I1[0-6]|I2[0-5]|Z13\.22|Z82\.4)/,
  "87880": /^(J0[23]|J06|R50|R07\.0)/,
  "87804": /^(J1[01]|J06|R50|R05|J20)/,
  "87811": /^(U07|J06|R50|R05|J1[01]|Z20)/,
  "81003": /^(N39|N30|R30|R35|R31|N10|R10)/,
  "93000": /^(R07|I48|R00|I1[0-6]|R55|R42|Z01\.81|I50)/,
  "36415": /./,
};
const SEX_SPECIFIC: Record<string, "F" | "M"> = { "84153": "M", "77067": "F" };
const VACCINE_CPT = new Set(["90686", "90715", "90750", "90677", "91320"]);

let lineSeq = 0;
const newId = (p: string) => `${p}_${(++lineSeq).toString(36)}`;

function line(cpt: string, source: ClaimLine["source"], rationale: string, evidence: string[], pointers: string[], modifiers: string[] = [], units = 1): ClaimLine {
  const f = FEE_SCHEDULE[cpt];
  return { id: newId("ln"), cpt, description: f?.desc ?? cpt, modifiers, pointers, units, charge: Math.round((f?.fee ?? 0) * units * 100) / 100, source, rationale, evidence };
}

function preventiveCode(age: number) {
  return age >= 65 ? "99397" : age >= 40 ? "99396" : "99395";
}

export function buildClaim(facts: Facts, coding: CodingResult, ctx: BillingContext): Claim {
  lineSeq = 0;
  const letters = "ABCDEFGHIJKL".split("");
  const dx: ClaimDx[] = [];
  const addDx = (code: string, label: string) => {
    const hit = dx.find((d) => d.code === code);
    if (hit) return hit.pointer;
    if (dx.length >= 12) return null;
    const pointer = letters[dx.length];
    dx.push({ pointer, code, label });
    return pointer;
  };
  for (const d of coding.diagnoses) addDx(d.code, d.label);
  const problemPointer = (label: string) => {
    const d = coding.diagnoses.find((x) => x.label === label);
    return d ? dx.find((x) => x.code === d.code)?.pointer : undefined;
  };

  const lines: ClaimLine[] = [];
  const telehealth = ctx.setting === "telehealth";
  const accepted = ctx.orders.filter((o) => (ctx.final ? o.status === "accepted" : o.status !== "rejected"));
  const excludedOrders = ctx.orders.filter((o) => !accepted.includes(o) && o.kind !== "follow_up").map((o) => `${o.name} (${o.status === "rejected" ? "rejected" : "not accepted"})`);

  const wellness = facts.problems.find((p) => p.key === "well");
  const problemDx = dx.filter((d) => d.code !== "Z00.00" && d.code !== "Z00.01").map((d) => d.pointer).slice(0, 4);
  if (wellness) {
    const code = preventiveCode(ctx.age);
    lines.push(line(code, "em", `Preventive visit for age ${ctx.age}`, wellness.evidence, [dx.find((d) => d.code.startsWith("Z00"))?.pointer ?? "A"]));
  }
  const problemsAddressed = facts.problems.filter((p) => p.key !== "well" && (p.plan.length || p.assessed));
  let emLine: ClaimLine | null = null;
  if (!wellness || problemsAddressed.length) {
    emLine = line(coding.em.code, "em", `${coding.em.level} MDM (${coding.em.patientType} patient)`, [...coding.em.problems.evidence, ...coding.em.risk.evidence].slice(0, 6), problemDx.length ? problemDx : ["A"], telehealth ? ["95"] : []);
    lines.push(emLine);
  }

  const vaccines = accepted.filter((o) => o.kind === "vaccine");
  const z23 = vaccines.length ? addDx("Z23", "Encounter for immunization") : null;
  const procedureToday = accepted.some((o) => /12-lead ECG/.test(o.name));

  for (const o of accepted) {
    const cpt = /CPT (\d{5})/.exec(o.detail)?.[1];
    if (!cpt) continue;
    const ptr = problemPointer(o.problem) ?? dx[0]?.pointer ?? "A";
    if (o.kind === "lab") {
      if (POC_TESTS.has(cpt)) lines.push(line(cpt, "lab", "Point-of-care test performed in office", o.evidence, [ptr], ["QW"]));
      continue;
    }
    if (o.kind === "procedure" && cpt === "93000") lines.push(line(cpt, "procedure", "Performed and interpreted in office", o.evidence, [ptr]));
    if (o.kind === "vaccine" && VACCINE_CPT.has(cpt)) lines.push(line(cpt, "vaccine", "Vaccine product administered today", o.evidence, [z23 ?? ptr]));
  }
  const bloodToday = accepted.some((o) => o.kind === "lab" && /today|now/.test(o.detail) && BLOOD_LABS.has(/CPT (\d{5})/.exec(o.detail)?.[1] ?? ""));
  if (bloodToday) lines.push(line("36415", "procedure", "Blood drawn in office for send-out labs", [], [dx[0]?.pointer ?? "A"]));
  if (vaccines.length) {
    const vEvidence = vaccines.flatMap((v) => v.evidence);
    lines.push(line("90471", "vaccine_admin", "First vaccine administered", vEvidence, [z23 ?? "A"]));
    if (vaccines.length > 1) lines.push(line("90472", "vaccine_admin", "Each additional vaccine", vEvidence, [z23 ?? "A"], [], vaccines.length - 1));
  }
  const separate = lines.some((l) => l.source === "procedure" && l.cpt !== "36415") || vaccines.length > 0 || !!wellness;
  if (emLine && separate) emLine.modifiers = Array.from(new Set([...emLine.modifiers, "25"]));

  const chronicLongitudinal = facts.problems.some((p) => p.chronic && !p.fromSymptom && (p.status === "not at goal" || p.plan.length > 0));
  const payer: Claim["payer"] = ctx.age >= 65 ? "Medicare" : "Commercial";
  const opportunities: Opportunity[] = [];
  const g2211Eligible = emLine && ctx.patientType === "established" && chronicLongitudinal;
  if (g2211Eligible) {
    const ev = facts.problems.filter((p) => p.chronic).flatMap((p) => p.evidence).slice(0, 3);
    const addOn = line("G2211", "addon", "Ongoing longitudinal care of a serious or complex chronic condition", ev, emLine!.pointers.slice(0, 1));
    if (payer === "Medicare") lines.push(addOn);
    else opportunities.push({ id: newId("op"), category: "addon", title: "G2211 complexity add-on", detail: "Established longitudinal care of a chronic condition. Billable to Medicare and many Medicare Advantage plans; verify this commercial payer's policy.", value: FEE_SCHEDULE.G2211.fee, evidence: ev, line: addOn });
  }

  const tobacco = facts.problems.find((p) => p.key === "tobacco");
  if (tobacco && tobacco.plan.some((x) => x.type === "counseling" && /smok|tobacco|quit/i.test(x.text))) {
    lines.push(line("99406", "counseling", "Tobacco cessation counseling", tobacco.plan.flatMap((x) => x.evidence), [problemPointer(tobacco.label) ?? "A"]));
  }

  const mood = facts.symptoms.some((s) => (s.key === "depressed_mood" || s.key === "anxiety") && !s.negated);
  const instrument = /\b(PHQ|GAD-7|GAD 7|PHQ-9|PHQ 9)\b/i.test(JSON.stringify(facts.problems.map((p) => p.plan.map((x) => x.text))));
  if (mood && !instrument) {
    opportunities.push({ id: newId("op"), category: "screening", title: "Standardized mood screening (96127)", detail: "Mood symptoms were discussed but no scored instrument was documented. Administering and scoring a PHQ-9 or GAD-7 is billable per instrument and strengthens the assessment.", value: FEE_SCHEDULE["96127"].fee, evidence: facts.symptoms.filter((s) => s.key === "depressed_mood" || s.key === "anxiety").flatMap((s) => s.evidence).slice(0, 2) });
  }
  if (coding.em.timeBased && coding.em.timeBased.code > coding.em.code && emLine) {
    const delta = (FEE_SCHEDULE[coding.em.timeBased.code]?.fee ?? 0) - (FEE_SCHEDULE[coding.em.code]?.fee ?? 0);
    opportunities.push({ id: newId("op"), category: "em_level", title: `Time supports ${coding.em.timeBased.code}`, detail: `${coding.em.timeBased.minutes} minutes were recorded. Documenting total time on the date of service (including review and documentation) supports ${coding.em.timeBased.code} instead of ${coding.em.code}.`, value: delta, evidence: [] });
  }
  const addressed = new Set(facts.problems.map((p) => p.icd10.slice(0, 3)));
  const HCC_CHART: [RegExp, string, string][] = [
    [/chronic kidney|CKD/i, "N18", "Chronic kidney disease"],
    [/heart failure|CHF/i, "I50", "Heart failure"],
    [/COPD|chronic obstructive/i, "J44", "COPD"],
    [/atrial fibrillation/i, "I48", "Atrial fibrillation"],
    [/type 2 diabetes|diabetes mellitus/i, "E11", "Type 2 diabetes"],
    [/major depressive|depression/i, "F32", "Depression"],
  ];
  for (const cp of ctx.chart?.problems ?? []) {
    const hit = HCC_CHART.find(([re]) => re.test(cp.name));
    if (hit && !addressed.has(hit[1])) {
      opportunities.push({ id: newId("op"), category: "hcc", title: `HCC suspect: ${hit[2]}`, detail: `${cp.name} is on the problem list but was not monitored, evaluated, assessed, or treated this visit. Address it this year to keep the risk score accurate.`, value: 0, evidence: [] });
    }
  }
  for (const c of coding.cdi.filter((x) => /laterality|Specify|stage|severity/i.test(x.message))) {
    opportunities.push({ id: newId("op"), category: "specificity", title: "Code specificity", detail: c.message, value: 0, evidence: c.evidence });
  }
  const lastPreventive = (ctx.chart?.priorVisits ?? []).find((v) => /annual|physical|well|wellness/i.test(v.summary));
  const at = ctx.at ?? new Date();
  const preventiveDue = !wellness && (!lastPreventive || (at.getTime() - new Date(lastPreventive.date).getTime()) / 86400000 > 365);
  if (preventiveDue && ctx.age >= 18) {
    opportunities.push({ id: newId("op"), category: "preventive", title: ctx.age >= 65 ? "Annual wellness visit due" : "Preventive visit due", detail: `No ${ctx.age >= 65 ? "annual wellness" : "preventive"} visit on record in the last 12 months. Schedule one; it can be combined with a problem visit using modifier 25.`, value: ctx.age >= 65 ? 175 : FEE_SCHEDULE[preventiveCode(ctx.age)].fee, evidence: [] });
  }

  const claim: Claim = {
    placeOfService: telehealth ? "10" : "11",
    payer,
    dx,
    lines,
    edits: [],
    opportunities,
    totals: { charges: 0, lines: lines.length },
    excludedOrders,
  };
  return validateClaim(claim, facts, coding, ctx);
}

export function validateClaim(claim: Claim, facts: Facts | null, coding: CodingResult | null, ctx: Pick<BillingContext, "age" | "sex" | "setting" | "patientType" | "chart" | "minutes">): Claim {
  const edits: ClaimEdit[] = [];
  let n = 0;
  const add = (severity: ClaimEdit["severity"], rule: string, message: string, lineId?: string) => edits.push({ id: `ed_${++n}`, severity, rule, message, lineId });
  const dxByPtr = new Map(claim.dx.map((d) => [d.pointer, d]));
  const em = claim.lines.find((l) => /^992\d\d$/.test(l.cpt));

  if (!claim.dx.length) add("error", "dx-required", "The claim has no diagnosis codes.");
  if (claim.dx.length > 12) add("error", "dx-limit", "A professional claim allows at most 12 diagnosis codes.");
  for (const l of claim.lines) {
    if (!l.pointers.length) add("error", "dx-pointer", `${l.cpt} has no diagnosis pointer.`, l.id);
    if (l.pointers.length > 4) add("error", "dx-pointer", `${l.cpt} points to more than 4 diagnoses.`, l.id);
    for (const p of l.pointers) if (!dxByPtr.has(p)) add("error", "dx-pointer", `${l.cpt} points to missing diagnosis ${p}.`, l.id);
    const rule = NECESSITY[l.cpt];
    if (rule && l.pointers.length && !l.pointers.some((p) => rule.test(dxByPtr.get(p)?.code ?? ""))) {
      add("error", "medical-necessity", `${l.cpt} (${l.description}) is not supported by the linked diagnosis ${l.pointers.map((p) => dxByPtr.get(p)?.code).join(", ")}; it is likely to deny for medical necessity.`, l.id);
    }
    const sex = SEX_SPECIFIC[l.cpt];
    if (sex && ctx.sex !== "X" && ctx.sex !== sex) add("error", "sex-edit", `${l.cpt} is inconsistent with the patient's sex.`, l.id);
    if (/^9939[5-7]$/.test(l.cpt)) {
      const expect = preventiveCode(ctx.age);
      if (l.cpt !== expect) add("error", "age-edit", `${l.cpt} does not match the patient's age (${ctx.age}); use ${expect}.`, l.id);
    }
    if (l.cpt === "99406" && !/minute|min\b/i.test(l.rationale)) add("warning", "time-documentation", "Tobacco cessation counseling (99406) requires documented counseling time of at least 3 minutes.", l.id);
  }
  const counts = new Map<string, number>();
  for (const l of claim.lines) counts.set(`${l.cpt}|${l.modifiers.join(",")}`, (counts.get(`${l.cpt}|${l.modifiers.join(",")}`) ?? 0) + 1);
  for (const [k, c] of counts) if (c > 1) add("error", "duplicate-line", `${k.split("|")[0]} is billed ${c} times; combine into one line with units.`);

  if (em) {
    const hasSeparate = claim.lines.some((l) => ["procedure", "vaccine_admin"].includes(l.source) && l.cpt !== "36415") || claim.lines.some((l) => /^9939\d$/.test(l.cpt));
    if (hasSeparate && !em.modifiers.includes("25")) add("error", "modifier-25", `${em.cpt} is billed with a same-day procedure, vaccine administration, or preventive visit and needs modifier 25.`, em.id);
    if (coding) {
      const lastDigit = (c: string) => Number(c.slice(-1));
      const expected = coding.em.code;
      const timeCode = coding.em.timeBased?.code;
      if (lastDigit(em.cpt) > lastDigit(expected) && em.cpt !== timeCode) add("error", "em-level", `${em.cpt} exceeds the documented MDM (${coding.em.level}, supports ${expected}). Document time or lower the level.`, em.id);
    }
    const newCode = /^9920\d$/.test(em.cpt);
    const priorSeen = (ctx.chart?.priorVisits ?? []).some((v) => (Date.now() - new Date(v.date).getTime()) / 86400000 < 3 * 365);
    if (newCode && priorSeen) add("error", "new-patient", `${em.cpt} is a new-patient code, but the patient was seen within 3 years; use an established-patient code.`, em.id);
    if (ctx.setting === "telehealth" && !em.modifiers.includes("95")) add("warning", "telehealth", "Telehealth visits need modifier 95 and place of service 10.", em.id);
    const g = claim.lines.find((l) => l.cpt === "G2211");
    if (g && em.modifiers.includes("25") && !claim.lines.some((l) => l.source === "vaccine_admin" || /^9939\d$/.test(l.cpt))) add("warning", "g2211-25", "G2211 is not payable when the E/M carries modifier 25 for a procedure (allowed only with preventive services or vaccine administration).", g.id);
  }
  if (facts) {
    const definitive = claim.dx.filter((d) => !d.code.startsWith("R") && !d.code.startsWith("Z"));
    for (const d of claim.dx.filter((x) => x.code.startsWith("R"))) {
      if (definitive.length) add("warning", "integral-symptom", `${d.code} (${d.label}) is a symptom code billed alongside a confirmed diagnosis; symptoms integral to the diagnosis should not be coded.`);
    }
    for (const d of claim.dx) if (/unspecified (?:side|ear|knee|shoulder)/i.test(d.label)) add("warning", "laterality", `${d.code} is unspecified for laterality; document the side to code specifically.`);
  }
  if (claim.opportunities.some((o) => o.category === "hcc")) add("info", "hcc-suspect", "Problem-list conditions with risk adjustment were not addressed this visit.");
  if (claim.excludedOrders.length) add("info", "excluded-orders", `Not billed: ${claim.excludedOrders.join("; ")}.`);

  const charges = Math.round(claim.lines.reduce((s, l) => s + l.charge, 0) * 100) / 100;
  return { ...claim, edits, totals: { charges, lines: claim.lines.length } };
}

export function claimStatus(claim: Claim): "ready" | "needs_review" {
  return claim.edits.some((e) => e.severity === "error" || e.severity === "warning") ? "needs_review" : "ready";
}

function seg(...parts: (string | number)[]) {
  return parts.join("*") + "~";
}

export function to837(claim: Claim, meta: { claimId: string; patient: { name: string; dob: string; sex: string; mrn: string }; provider: { name: string; npi: string }; date: string }) {
  const d = meta.date.replace(/-/g, "").slice(0, 8);
  const [first, ...rest] = meta.patient.name.split(" ");
  const last = rest.join(" ") || first;
  const [pf, ...pr] = meta.provider.name.replace(/^Dr\.?\s*/, "").split(" ");
  const out = [
    seg("ISA", "00", "          ", "00", "          ", "ZZ", "CHARTSIDE      ", "ZZ", "CLEARINGHOUSE  ", d.slice(2), "1200", "^", "00501", "000000001", "0", "T", ":"),
    seg("GS", "HC", "CHARTSIDE", "CLEARINGHOUSE", d, "1200", "1", "X", "005010X222A1"),
    seg("ST", "837", "0001", "005010X222A1"),
    seg("BHT", "0019", "00", meta.claimId, d, "1200", "CH"),
    seg("NM1", "85", "1", pr.join(" ") || pf, pf, "", "", "", "XX", meta.provider.npi),
    seg("NM1", "IL", "1", last, first, "", "", "", "MI", meta.patient.mrn),
    seg("DMG", "D8", meta.patient.dob.replace(/-/g, ""), meta.patient.sex === "X" ? "U" : meta.patient.sex),
    seg("CLM", meta.claimId, claim.totals.charges.toFixed(2), "", "", `${claim.placeOfService}:B:1`, "Y", "A", "Y", "Y"),
    seg("HI", ...claim.dx.map((x, i) => `${i === 0 ? "ABK" : "ABF"}:${x.code.replace(".", "")}`)),
  ];
  claim.lines.forEach((l, i) => {
    out.push(seg("LX", i + 1));
    out.push(seg("SV1", ["HC", l.cpt, ...l.modifiers].join(":"), l.charge.toFixed(2), "UN", l.units, "", "", l.pointers.map((p) => "ABCDEFGHIJKL".indexOf(p) + 1).join(":")));
    out.push(seg("DTP", "472", "D8", d));
  });
  out.push(seg("SE", out.length - 1, "0001"), seg("GE", "1", "1"), seg("IEA", "1", "000000001"));
  return out.join("\n");
}
