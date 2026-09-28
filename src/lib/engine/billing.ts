import { DISCIPLINE_MODIFIER, unitsFor } from "./therapy";
import { pediatricPreventive } from "./wellchild";
import type { Chart, CodingResult, StagedOrder } from "../types";
import type { Facts } from "./extract";

export interface ClaimDx {
  pointer: string;
  code: string;
  label: string;
}

export interface EditSource {
  set: string;
  version: string;
  ref?: string;
}

export interface LinePricing {
  basis: "MPFS" | "CLFS" | "ASP" | "none";
  allowed: number | null;
  status?: string;
  rvu?: number;
  coinsurance?: number;
  note?: string;
  source?: EditSource;
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
  pricing?: LinePricing;
}

export interface ClaimEdit {
  id: string;
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  lineId?: string;
  source?: EditSource;
}

export interface Opportunity {
  id: string;
  category: "em_level" | "addon" | "screening" | "counseling" | "hcc" | "preventive" | "specificity" | "part_d" | "prolonged";
  title: string;
  detail: string;
  value: number;
  evidence: string[];
  line?: ClaimLine;
  source?: EditSource;
}

export type Payer = "Medicare" | "Medicare Advantage" | "Medicaid" | "Commercial" | "Self-pay";

export interface Claim {
  placeOfService: string;
  serviceFacility?: { name: string; address: string } | null;
  payer: Payer;
  dx: ClaimDx[];
  lines: ClaimLine[];
  edits: ClaimEdit[];
  opportunities: Opportunity[];
  totals: { charges: number; lines: number; allowed?: number | null; patientResponsibility?: number | null };
  excludedOrders: string[];
  dos?: string;
  reference?: { label: string; version: string }[];
  supervising?: { name: string; modifier: string | null };
}

export interface ClaimReference {
  dos: string;
  describe(code: string): string | null;
  price(line: Pick<ClaimLine, "cpt" | "modifiers" | "units">, claim: Pick<Claim, "placeOfService" | "payer">): { charge: number | null; pricing: LinePricing } | null;
  expected(code: string, claim: Pick<Claim, "placeOfService" | "payer">): number | null;
  review(claim: Claim, ctx: { age: number; sex: string; minutes: number; chart?: Chart; facts: Facts | null }): ClaimEdit[];
  versions(): { label: string; version: string }[];
}

export interface BillingContext {
  age: number;
  sex: "F" | "M" | "X";
  setting: "in-person" | "telehealth" | "inpatient" | "ed";
  criticalCareMinutes?: number;
  patientType: "new" | "established";
  chart?: Chart;
  minutes: number;
  orders: StagedOrder[];
  at?: Date;
  final?: boolean;
  payer?: Payer;
  ref?: ClaimReference;
}

export const SERVICE_SUMMARY: Record<string, string> = {
  "99282": "Emergency department visit, straightforward MDM",
  "99283": "Emergency department visit, low MDM",
  "99284": "Emergency department visit, moderate MDM",
  "99285": "Emergency department visit, high MDM",
  "99291": "Critical care, first 30 to 74 minutes",
  "99292": "Critical care, each additional 30 minutes",
  "90791": "Psychiatric diagnostic evaluation",
  "97161": "PT evaluation, low complexity",
  "97162": "PT evaluation, moderate complexity",
  "97163": "PT evaluation, high complexity",
  "97164": "PT re-evaluation",
  "97165": "OT evaluation, low complexity",
  "97166": "OT evaluation, moderate complexity",
  "97167": "OT evaluation, high complexity",
  "97168": "OT re-evaluation",
  "97110": "Therapeutic exercise, each 15 minutes",
  "97112": "Neuromuscular re-education, each 15 minutes",
  "97116": "Gait training, each 15 minutes",
  "97140": "Manual therapy, each 15 minutes",
  "97530": "Therapeutic activities, each 15 minutes",
  "97535": "Self-care/home management training, each 15 minutes",
  "97035": "Ultrasound, each 15 minutes",
  "97014": "Electrical stimulation, unattended",
  "97010": "Hot or cold packs (bundled)",
  "0502F": "Subsequent prenatal care visit (global OB package, tracking only)",
  G0444: "Annual depression screening, 5 to 15 minutes", "99495": "Transitional care management, moderate complexity, visit within 14 days", "99496": "Transitional care management, high complexity, visit within 7 days", "99497": "Advance care planning, first 30 minutes",
  "96110": "Developmental screening with standardized instrument", "96161": "Caregiver-focused health risk assessment", "99188": "Topical fluoride varnish", "99173": "Visual acuity screening", "92551": "Screening pure tone audiometry", "85018": "Hemoglobin", "83655": "Lead",
  "99381": "Preventive visit, new patient, under 1 year", "99382": "Preventive visit, new patient, 1 to 4 years", "99383": "Preventive visit, new patient, 5 to 11 years", "99384": "Preventive visit, new patient, 12 to 17 years",
  "99391": "Preventive visit, established patient, under 1 year", "99392": "Preventive visit, established patient, 1 to 4 years", "99393": "Preventive visit, established patient, 5 to 11 years", "99394": "Preventive visit, established patient, 12 to 17 years",
  "20600": "Arthrocentesis/injection, small joint", "20604": "Arthrocentesis/injection, small joint, with ultrasound",
  "20605": "Arthrocentesis/injection, intermediate joint", "20606": "Arthrocentesis/injection, intermediate joint, with ultrasound",
  "20610": "Arthrocentesis/injection, major joint", "20611": "Arthrocentesis/injection, major joint, with ultrasound",
  "11102": "Tangential biopsy of skin, single lesion", "11103": "Tangential biopsy, each additional lesion",
  "11104": "Punch biopsy of skin, single lesion", "11105": "Punch biopsy, each additional lesion",
  "11106": "Incisional biopsy of skin, single lesion", "11107": "Incisional biopsy, each additional lesion",
  "17000": "Destruction of premalignant lesion, first", "17003": "Destruction of premalignant lesions, 2 to 14, each", "17004": "Destruction of premalignant lesions, 15 or more",
  "17110": "Destruction of benign lesions, up to 14", "17111": "Destruction of benign lesions, 15 or more",
  "12001": "Simple repair, 2.5 cm or less", "12002": "Simple repair, 2.6 to 7.5 cm", "12004": "Simple repair, 7.6 to 12.5 cm", "12005": "Simple repair, 12.6 to 20 cm",
  "12011": "Simple repair of face, 2.5 cm or less", "12013": "Simple repair of face, 2.6 to 5 cm", "12014": "Simple repair of face, 5.1 to 7.5 cm", "12015": "Simple repair of face, 7.6 to 12.5 cm",
  "10060": "Incision and drainage of abscess, simple", "10061": "Incision and drainage of abscess, complicated",
  "69209": "Cerumen removal by irrigation", "69210": "Cerumen removal with instrumentation",
  "96372": "Therapeutic injection, SC or IM",
  J3301: "Triamcinolone acetonide, per 10 mg", J1030: "Methylprednisolone acetate, 40 mg", J1885: "Ketorolac, per 15 mg", J0696: "Ceftriaxone, per 250 mg", J3420: "Vitamin B-12, up to 1000 mcg", J1100: "Dexamethasone sodium phosphate, 1 mg",
  "90832": "Psychotherapy, 30 minutes (16 to 37)",
  "90834": "Psychotherapy, 45 minutes (38 to 52)",
  "90837": "Psychotherapy, 60 minutes (53 or more)",
  "90833": "Psychotherapy add-on with E/M, 30 minutes",
  "90836": "Psychotherapy add-on with E/M, 45 minutes",
  "90838": "Psychotherapy add-on with E/M, 60 minutes",
  "99221": "Initial hospital inpatient or observation care, straightforward or low MDM",
  "99222": "Initial hospital inpatient or observation care, moderate MDM",
  "99223": "Initial hospital inpatient or observation care, high MDM",
  "99231": "Subsequent hospital inpatient or observation care, straightforward or low MDM",
  "99232": "Subsequent hospital inpatient or observation care, moderate MDM",
  "99233": "Subsequent hospital inpatient or observation care, high MDM",
  "99238": "Hospital discharge day management, 30 minutes or less",
  "99239": "Hospital discharge day management, more than 30 minutes",
  "99202": "Office visit, new patient, straightforward MDM",
  "99203": "Office visit, new patient, low MDM",
  "99204": "Office visit, new patient, moderate MDM",
  "99205": "Office visit, new patient, high MDM",
  "99212": "Office visit, established patient, straightforward MDM",
  "99213": "Office visit, established patient, low MDM",
  "99214": "Office visit, established patient, moderate MDM",
  "99215": "Office visit, established patient, high MDM",
  "99417": "Prolonged outpatient service, each 15 minutes",
  "99395": "Preventive visit, established, 18-39",
  "99396": "Preventive visit, established, 40-64",
  "99397": "Preventive visit, established, 65+",
  "36415": "Venipuncture",
  "87880": "Rapid strep antigen (CLIA-waived)",
  "87804": "Influenza antigen (CLIA-waived)",
  "87811": "SARS-CoV-2 antigen (CLIA-waived)",
  "81003": "Urinalysis, automated, without microscopy",
  "83036": "Hemoglobin A1c",
  "93000": "Electrocardiogram, 12-lead with interpretation",
  "90656": "Influenza vaccine, trivalent, preservative-free",
  "90715": "Tdap vaccine",
  "90750": "Zoster vaccine, recombinant",
  "90677": "Pneumococcal conjugate vaccine, 20-valent",
  "91320": "COVID-19 vaccine",
  "90471": "Immunization administration, first vaccine",
  "90472": "Immunization administration, each additional",
  "90480": "COVID-19 vaccine administration",
  "96127": "Brief emotional/behavioral assessment, scored instrument",
  "99406": "Tobacco cessation counseling, 3-10 minutes",
};

const FALLBACK_CHARGE: Record<string, number> = {
  "99282": 60, "99283": 100, "99284": 170, "99285": 250, "99291": 280, "99292": 125,
  "90791": 180, "90832": 80, "90834": 110, "90837": 160, "90833": 75, "90836": 95, "90838": 130,
  "99221": 105, "99222": 155, "99223": 205, "99231": 60, "99232": 90, "99233": 130, "99238": 95, "99239": 135,
  "99202": 75, "99203": 115, "99204": 172, "99205": 227, "99212": 58, "99213": 93, "99214": 132, "99215": 186,
  G2211: 16, G2212: 31, "99417": 31, "99395": 118, "99396": 125, "99397": 135, G0438: 175, G0439: 130,
  "36415": 3, "87880": 16, "87804": 16, "87811": 41, "81003": 3, "83036": 13, "93000": 17,
  "90656": 24, "90715": 40, "90750": 196, "90677": 254, "91320": 128, "90471": 25, "90472": 13, "90480": 45, G0008: 34, G0009: 34, G0010: 34,
  "96127": 5, "99406": 15, G0444: 18, "99497": 85, "99495": 200, "99496": 272, "96110": 10, "96161": 5, "99188": 20, "99173": 3, "92551": 12, "85018": 3, "83655": 12,
  "99381": 120, "99382": 125, "99383": 130, "99384": 140, "99391": 105, "99392": 115, "99393": 115, "99394": 125,
  "97161": 101, "97162": 101, "97163": 101, "97164": 70, "97165": 104, "97166": 104, "97167": 104, "97168": 71,
  "20600": 56, "20604": 75, "20605": 58, "20606": 80, "20610": 63, "20611": 92, "11102": 100, "11103": 55, "11104": 125, "11105": 65, "11106": 150, "11107": 75,
  "17000": 68, "17003": 5, "17004": 145, "17110": 110, "17111": 132, "12001": 105, "12002": 120, "12004": 145, "12005": 175, "12011": 115, "12013": 125, "12014": 145, "12015": 170,
  "10060": 125, "10061": 215, "69209": 15, "69210": 48, "96372": 15, J3301: 2, J1030: 5, J1885: 1, J0696: 1, J3420: 1, J1100: 1,
  "97110": 29, "97112": 34, "97116": 29, "97140": 26, "97530": 36, "97535": 32, "97035": 12, "97014": 12, "97010": 0,
};

const POC_TESTS = new Set(["87880", "87804", "87811", "81003"]);
const BLOOD_LABS = new Set(["83036", "80061", "80053", "80048", "85025", "84443", "82306", "82607", "83540", "84153", "84550"]);
export const NECESSITY: Record<string, RegExp> = {
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
const VACCINE_CPT = new Set(["90656", "90715", "90750", "90677", "91320"]);
const FLU = /^(9063[0-9]|9065[3-9]|9066[0-4]|9066[6-8]|9067[3-4]|9068[2-9]|9075[6]|90616)$/;
const PNEUMO = /^(90670|90671|90677|90684|90732)$/;
const HEPB = /^(90739|9074[0-7]|90759)$/;
const COVID = /^913\d\d$/;
const PART_D = new Set(["90750", "90715"]);
export const MEDICARE_ADMIN: [RegExp, string, string][] = [
  [FLU, "G0008", "Administration of influenza vaccine (Medicare)"],
  [PNEUMO, "G0009", "Administration of pneumococcal vaccine (Medicare)"],
  [HEPB, "G0010", "Administration of hepatitis B vaccine (Medicare)"],
  [COVID, "90480", "COVID-19 vaccine administration"],
];
export const PROLONGED = {
  medicare: { code: "G2212", base: { "99205": 89, "99215": 69 } as Record<string, number> },
  cpt: { code: "99417", base: { "99205": 75, "99215": 55 } as Record<string, number> },
};
export const isMedicare = (p: Payer) => p === "Medicare";

let lineSeq = 0;
const newId = (p: string) => `${p}_${(++lineSeq).toString(36)}`;

export function defaultPayer(age: number): Payer {
  return age >= 65 ? "Medicare" : "Commercial";
}

function preventiveCode(age: number, payer: Payer, chart?: Chart, patientType: "new" | "established" = "established") {
  if (age < 18) return pediatricPreventive(age, patientType);
  if (isMedicare(payer)) {
    const priorAwv = (chart?.priorVisits ?? []).some((v) => /annual wellness|AWV|G043[89]/i.test(v.summary));
    return priorAwv ? "G0439" : "G0438";
  }
  return pediatricPreventive(age, patientType);
}

export function prolongedUnits(emCode: string, minutes: number, payer: Payer) {
  const rule = isMedicare(payer) ? PROLONGED.medicare : PROLONGED.cpt;
  const base = rule.base[emCode];
  if (!base || minutes < base) return null;
  return { code: rule.code, units: Math.floor((minutes - base) / 15) + 1, threshold: base };
}

export function buildClaim(facts: Facts, coding: CodingResult, ctx: BillingContext): Claim {
  lineSeq = 0;
  const payer = ctx.payer ?? defaultPayer(ctx.age);
  const telehealth = ctx.setting === "telehealth";
  const ed = ctx.setting === "ed";
  const inpatient = ctx.setting === "inpatient" || ed;
  const placeOfService = ed ? "23" : ctx.setting === "inpatient" ? "21" : telehealth ? "10" : "11";
  const ref = ctx.ref;
  const describe = (code: string) => ref?.describe(code) ?? SERVICE_SUMMARY[code] ?? code;
  const valueOf = (code: string) => ref?.expected(code, { placeOfService, payer }) ?? FALLBACK_CHARGE[code] ?? 0;
  const line = (cpt: string, source: ClaimLine["source"], rationale: string, evidence: string[], pointers: string[], modifiers: string[] = [], units = 1): ClaimLine => ({
    id: newId("ln"),
    cpt,
    description: describe(cpt),
    modifiers,
    pointers,
    units,
    charge: Math.round((FALLBACK_CHARGE[cpt] ?? 0) * units * 100) / 100,
    source,
    rationale,
    evidence,
  });

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
  const acceptedAll = ctx.orders.filter((o) => (ctx.final ? o.status === "accepted" : o.status !== "rejected"));
  const accepted = inpatient ? [] : acceptedAll;
  const excludedOrders = ctx.orders.filter((o) => !acceptedAll.includes(o) && o.kind !== "follow_up").map((o) => `${o.name} (${o.status === "rejected" ? "rejected" : "not accepted"})`);
  if (inpatient) excludedOrders.push(...acceptedAll.filter((o) => o.kind !== "follow_up" && o.kind !== "medication" && o.kind !== "referral").map((o) => `${o.name} (billed on the hospital facility claim)`));
  const opportunities: Opportunity[] = [];

  const wellness = facts.problems.find((p) => p.key === "well");
  const problemDx = dx.filter((d) => !/^Z00\.0/.test(d.code)).map((d) => d.pointer).slice(0, 4);
  if (wellness && !coding.wellChild && !coding.awv) {
    const code = preventiveCode(ctx.age, payer, ctx.chart, ctx.patientType);
    const why = code === "G0438" ? "Initial Medicare annual wellness visit" : code === "G0439" ? "Subsequent Medicare annual wellness visit" : `Preventive visit for age ${ctx.age}`;
    lines.push(line(code, "em", why, wellness.evidence, [dx.find((d) => d.code.startsWith("Z00"))?.pointer ?? "A"]));
  }
  const problemsAddressed = facts.problems.filter((p) => p.key !== "well" && (p.plan.length || p.assessed));
  let emLine: ClaimLine | null = null;
  const therapy = coding.therapy;
  if (coding.awv) {
    const ptr = [dx.find((d) => d.code.startsWith("Z00"))?.pointer ?? "A"];
    const medicare = isMedicare(payer) || payer === "Medicare Advantage";
    const code = medicare ? (coding.awv.subsequent ? "G0439" : "G0438") : preventiveCode(ctx.age, payer, ctx.chart, ctx.patientType);
    lines.push(line(code, "em", medicare ? `${coding.awv.subsequent ? "Subsequent" : "Initial"} annual wellness visit` : `Preventive visit for age ${ctx.age} (AWV codes are Medicare-only)`, [], ptr));
    if (medicare && coding.awv.subsequent && coding.awv.depressionScreened) lines.push(line("G0444", "screening", "Annual depression screening with the subsequent AWV", [], ptr));
    if ((coding.awv.acpMinutes ?? 0) >= 16) lines.push(line("99497", "counseling", `Advance care planning, ${coding.awv.acpMinutes} minutes, voluntary`, [], ptr, medicare ? ["33"] : []));
  } else if (coding.wellChild) {
    const wcPtr = [dx.find((d) => d.code.startsWith("Z00"))?.pointer ?? "A"];
    lines.push(line(coding.wellChild.preventive, "em", `Preventive visit, age ${ctx.age}`, [], wcPtr));
    for (const s of coding.wellChild.screens) lines.push(line(s.cpt, s.cpt === "85018" || s.cpt === "83655" || s.cpt === "80061" ? "lab" : "screening", s.label, [], wcPtr, [], s.units));
  } else if (coding.prenatal?.globalPackage) {
    lines.push(line("0502F", "em", "Routine prenatal visit included in the global obstetric package (59400, 59510, 59610, or 59618), reported with CPT II 0502F for tracking", [], problemDx.length ? problemDx : ["A"]));
  } else if (therapy) {
    const mod = DISCIPLINE_MODIFIER[therapy.discipline];
    const ptrs = problemDx.length ? problemDx : ["A"];
    if (therapy.evalCode) lines.push(line(therapy.evalCode, "procedure", `${therapy.discipline} ${/9716[48]|92524/.test(therapy.evalCode) ? "re-evaluation" : "evaluation"}`, [], ptrs, [mod]));
    const method = payer === "Medicare" || payer === "Medicare Advantage" ? "cms" : "per_code";
    const units = unitsFor(therapy.services, method);
    for (const s of therapy.services) {
      const n = units.get(s.cpt) ?? 0;
      if (n > 0) lines.push(line(s.cpt, "procedure", s.timed ? `${s.label}, ${s.minutes} min (${method === "cms" ? "CMS 8-minute rule across all timed services" : "8-minute rule per service"})` : `${s.label} (untimed)`, s.evidence, ptrs, [mod], n));
    }
  } else if (!wellness || problemsAddressed.length) {
    emLine = line(coding.em.code, "em", coding.tcm?.code ? `Transitional care management, face-to-face visit on day ${coding.tcm.daysAfterDischarge} after discharge` : coding.em.code === "90853" ? "Group psychotherapy" : /^908/.test(coding.em.code) ? `Psychotherapy by session time (${ctx.minutes} min)` : `${coding.em.level} MDM (${coding.em.patientType} patient)`, [...coding.em.problems.evidence, ...coding.em.risk.evidence].slice(0, 6), problemDx.length ? problemDx : ["A"], telehealth ? ["95"] : []);
    lines.push(emLine);
  }

  const proc = coding.procedures;
  if (proc && !therapy) {
    const ptrs = problemDx.length ? problemDx : ["A"];
    for (const p of proc.procedures) {
      lines.push(line(p.cpt, "procedure", `${p.label}${p.site ? `, ${p.site}` : ""}`, p.evidence, ptrs, p.laterality ? [p.laterality] : []));
      if (p.addOn) lines.push(line(p.addOn.cpt, "procedure", p.addOn.label, p.evidence, ptrs, [], p.addOn.units));
    }
    for (const d of proc.drugs) lines.push(line(d.hcpcs, "procedure", `${d.label} ${d.dose}`, d.evidence, ptrs, [], d.units));
    if (emLine && proc.procedures.length) emLine.modifiers = Array.from(new Set([...emLine.modifiers, "25"]));
  }

  if (emLine && coding.psychotherapyAddOn) lines.push(line(coding.psychotherapyAddOn.code, "addon", `Psychotherapy ${coding.psychotherapyAddOn.minutes} min with E/M, time separate from E/M`, coding.psychotherapyAddOn.evidence, emLine.pointers.slice(0, 1)));

  const cc = ctx.criticalCareMinutes ?? 0;
  if (ed && emLine && cc >= 30) {
    lines.push(line("99291", "addon", `Critical care, ${cc} minutes documented`, [], emLine.pointers.slice(0, 1)));
    const extra = cc >= 104 ? Math.floor((cc - 104) / 30) + 1 : 0;
    if (extra) lines.push(line("99292", "addon", `Critical care beyond 74 minutes (${cc} total)`, [], emLine.pointers.slice(0, 1), [], extra));
    emLine.modifiers = Array.from(new Set([...emLine.modifiers, "25"]));
  }

  const injury = dx.some((d) => /^[ST]/.test(d.code));
  const vaccines = accepted.filter((o) => o.kind === "vaccine");
  const partBVaccines: StagedOrder[] = [];
  for (const v of vaccines) {
    const cpt = /CPT (\d{5})/.exec(v.detail)?.[1] ?? "";
    if (isMedicare(payer) && PART_D.has(cpt) && !(cpt === "90715" && injury)) {
      excludedOrders.push(`${v.name} (Medicare Part D vaccine; bill the Part D plan, not the Part B claim)`);
      opportunities.push({ id: newId("op"), category: "part_d", title: `${v.name}: bill Medicare Part D`, detail: `Medicare covers ${cpt === "90750" ? "the recombinant zoster vaccine" : "routine Tdap"} under Part D. Bill the patient's Part D plan (for example through a pharmacy-network portal) or refer to a pharmacy; a Part B claim will deny.`, value: 0, evidence: v.evidence, source: { set: "CMS", version: "Medicare Claims Processing Manual Ch. 18 §10; Part D vaccine coverage" } });
      continue;
    }
    partBVaccines.push(v);
  }
  const z23 = partBVaccines.length ? addDx("Z23", "Encounter for immunization") : null;

  for (const o of accepted) {
    const cpt = /CPT (\d{5})/.exec(o.detail)?.[1];
    if (!cpt) continue;
    const ptr = problemPointer(o.problem) ?? dx[0]?.pointer ?? "A";
    if (o.kind === "lab") {
      if (POC_TESTS.has(cpt)) lines.push(line(cpt, "lab", "Point-of-care test performed in office", o.evidence, [ptr], ["QW"]));
      continue;
    }
    if (o.kind === "procedure" && cpt === "93000") lines.push(line(cpt, "procedure", "Performed and interpreted in office", o.evidence, [ptr]));
    if (o.kind === "vaccine" && VACCINE_CPT.has(cpt) && partBVaccines.includes(o)) lines.push(line(cpt, "vaccine", "Vaccine product administered today", o.evidence, [cpt === "90715" && injury ? ptr : (z23 ?? ptr)]));
  }
  const bloodToday = accepted.some((o) => o.kind === "lab" && /today|now/.test(o.detail) && BLOOD_LABS.has(/CPT (\d{5})/.exec(o.detail)?.[1] ?? ""));
  if (bloodToday) lines.push(line("36415", "procedure", "Blood drawn in office for send-out labs", [], [dx[0]?.pointer ?? "A"]));

  if (partBVaccines.length) {
    const evidence = partBVaccines.flatMap((v) => v.evidence);
    const codes = partBVaccines.map((v) => /CPT (\d{5})/.exec(v.detail)?.[1] ?? "");
    const ptr = z23 ?? "A";
    if (isMedicare(payer)) {
      for (const c of codes) {
        const m = MEDICARE_ADMIN.find(([re]) => re.test(c));
        if (m) lines.push(line(m[1], "vaccine_admin", m[2], evidence, [ptr]));
        else lines.push(line(lines.some((l) => l.cpt === "90471") ? "90472" : "90471", "vaccine_admin", "Vaccine administration", evidence, [ptr]));
      }
    } else {
      const covid = codes.filter((c) => COVID.test(c)).length;
      const other = codes.length - covid;
      if (covid) lines.push(line("90480", "vaccine_admin", "COVID-19 vaccine administration", evidence, [ptr], [], covid));
      if (other) {
        lines.push(line("90471", "vaccine_admin", "First vaccine administered", evidence, [ptr]));
        if (other > 1) lines.push(line("90472", "vaccine_admin", "Each additional vaccine", evidence, [ptr], [], other - 1));
      }
    }
  }
  const separate = lines.some((l) => l.source === "procedure" && l.cpt !== "36415") || lines.some((l) => l.source === "vaccine_admin") || !!wellness;
  if (emLine && separate) emLine.modifiers = Array.from(new Set([...emLine.modifiers, "25"]));

  if (emLine && coding.em.timeBased && coding.em.timeBased.code === emLine.cpt) {
    const pl = prolongedUnits(emLine.cpt, coding.em.timeBased.minutes, payer);
    if (pl) lines.push(line(pl.code, "addon", `Total time ${coding.em.timeBased.minutes} min exceeds the ${pl.threshold}-minute threshold for ${emLine.cpt}`, [], emLine.pointers.slice(0, 1), [], pl.units));
  }

  const chronicLongitudinal = facts.problems.some((p) => p.chronic && !p.fromSymptom && (p.status === "not at goal" || p.plan.length > 0));
  const g2211Eligible = emLine && !inpatient && /^992(?:0[2-5]|1[2-5])$/.test(emLine.cpt) && ctx.patientType === "established" && chronicLongitudinal;
  if (g2211Eligible) {
    const ev = facts.problems.filter((p) => p.chronic).flatMap((p) => p.evidence).slice(0, 3);
    const addOn = line("G2211", "addon", "Ongoing longitudinal care of a serious or complex chronic condition", ev, emLine!.pointers.slice(0, 1));
    const g2211With25Ok = !emLine!.modifiers.includes("25") || lines.some((l) => l.source === "vaccine_admin" || /^G043[89]$/.test(l.cpt));
    if ((isMedicare(payer) || payer === "Medicare Advantage") && g2211With25Ok) lines.push(addOn);
    else if (!isMedicare(payer) && payer !== "Medicare Advantage") opportunities.push({ id: newId("op"), category: "addon", title: "G2211 complexity add-on", detail: "Established longitudinal care of a chronic condition. G2211 is a Medicare code; many Medicare Advantage and some commercial plans accept it. Verify this payer's policy before adding.", value: valueOf("G2211"), evidence: ev, line: addOn });
  }

  const tobacco = facts.problems.find((p) => p.key === "tobacco");
  if (tobacco && tobacco.plan.some((x) => x.type === "counseling" && /smok|tobacco|quit/i.test(x.text))) {
    lines.push(line("99406", "counseling", "Tobacco cessation counseling", tobacco.plan.flatMap((x) => x.evidence), [problemPointer(tobacco.label) ?? "A"]));
  }

  const mood = facts.symptoms.some((s) => (s.key === "depressed_mood" || s.key === "anxiety") && !s.negated);
  const instrument = /\b(PHQ|GAD-7|GAD 7|PHQ-9|PHQ 9)\b/i.test(JSON.stringify(facts.problems.map((p) => p.plan.map((x) => x.text))));
  if (mood && !instrument) {
    opportunities.push({ id: newId("op"), category: "screening", title: "Standardized mood screening (96127)", detail: "Mood symptoms were discussed but no scored instrument was documented. Administering and scoring a PHQ-9 or GAD-7 is reportable per instrument and strengthens the assessment.", value: valueOf("96127"), evidence: facts.symptoms.filter((s) => s.key === "depressed_mood" || s.key === "anxiety").flatMap((s) => s.evidence).slice(0, 2) });
  }
  if (coding.em.timeBased && coding.em.timeBased.code > coding.em.code && emLine) {
    const delta = Math.round((valueOf(coding.em.timeBased.code) - valueOf(coding.em.code)) * 100) / 100;
    opportunities.push({ id: newId("op"), category: "em_level", title: `Time supports ${coding.em.timeBased.code}`, detail: `${coding.em.timeBased.minutes} minutes were recorded. Documenting total time on the date of service (including review and documentation) supports ${coding.em.timeBased.code} instead of ${coding.em.code}.`, value: delta, evidence: [] });
  }
  for (const c of coding.cdi.filter((x) => /laterality|Specify|stage|severity/i.test(x.message))) {
    opportunities.push({ id: newId("op"), category: "specificity", title: "Code specificity", detail: c.message, value: 0, evidence: c.evidence });
  }
  const lastPreventive = (ctx.chart?.priorVisits ?? []).find((v) => /annual|physical|well|wellness/i.test(v.summary));
  const at = ctx.at ?? new Date();
  const preventiveDue = !wellness && (!lastPreventive || (at.getTime() - new Date(lastPreventive.date).getTime()) / 86400000 > 365);
  if (preventiveDue && ctx.age >= 18) {
    const code = preventiveCode(ctx.age, payer, ctx.chart);
    opportunities.push({ id: newId("op"), category: "preventive", title: isMedicare(payer) ? `Annual wellness visit due (${code})` : "Preventive visit due", detail: `No ${isMedicare(payer) ? "annual wellness" : "preventive"} visit on record in the last 12 months. Schedule one; it can be combined with a problem visit using modifier 25.`, value: valueOf(code), evidence: [] });
  }

  const claim: Claim = { placeOfService, payer, dx, lines, edits: [], opportunities, totals: { charges: 0, lines: lines.length }, excludedOrders, dos: at.toISOString().slice(0, 10) };
  return validateClaim(claim, facts, coding, { ...ctx, payer });
}

function priceLines(claim: Claim, ref?: ClaimReference) {
  if (!ref) return claim;
  const lines = claim.lines.map((l) => {
    const p = ref.price(l, claim);
    return p ? { ...l, charge: (l.source === "manual" && l.charge > 0) || p.charge === null ? l.charge : p.charge, pricing: p.pricing } : { ...l, pricing: { basis: "none" as const, allowed: null, note: "No Medicare pricing found for this code" } };
  });
  return { ...claim, lines };
}

export function validateClaim(input: Claim, facts: Facts | null, coding: CodingResult | null, ctx: Pick<BillingContext, "age" | "sex" | "setting" | "patientType" | "chart" | "minutes" | "ref" | "payer">): Claim {
  const claim = priceLines(input, ctx.ref);
  const edits: ClaimEdit[] = [];
  let n = 0;
  const add = (severity: ClaimEdit["severity"], rule: string, message: string, lineId?: string, source?: EditSource) => edits.push({ id: `ed_${++n}`, severity, rule, message, lineId, ...(source ? { source } : {}) });
  const chartside = { set: "Chartside rules", version: "2026.3" };
  const dxByPtr = new Map(claim.dx.map((d) => [d.pointer, d]));
  const em = claim.lines.find((l) => /^992\d\d$/.test(l.cpt));

  if (!claim.dx.length) add("error", "dx-required", "The claim has no diagnosis codes.", undefined, { set: "X12 837P", version: "005010X222A1", ref: "2300 HI" });
  if (claim.dx.length > 12) add("error", "dx-limit", "A professional claim allows at most 12 diagnosis codes.", undefined, { set: "X12 837P", version: "005010X222A1", ref: "2300 HI" });
  for (const l of claim.lines) {
    if (!l.pointers.length) add("error", "dx-pointer", `${l.cpt} has no diagnosis pointer.`, l.id, { set: "X12 837P", version: "005010X222A1", ref: "2400 SV107" });
    if (l.pointers.length > 4) add("error", "dx-pointer", `${l.cpt} points to more than 4 diagnoses.`, l.id, { set: "X12 837P", version: "005010X222A1", ref: "2400 SV107" });
    for (const p of l.pointers) if (!dxByPtr.has(p)) add("error", "dx-pointer", `${l.cpt} points to missing diagnosis ${p}.`, l.id);
    const rule = NECESSITY[l.cpt];
    if (!ctx.ref && rule && l.pointers.length && !l.pointers.some((p) => rule.test(dxByPtr.get(p)?.code ?? ""))) {
      add("error", "medical-necessity", `${l.cpt} (${l.description}) is not supported by the linked diagnosis ${l.pointers.map((p) => dxByPtr.get(p)?.code).join(", ")}; it is likely to deny for medical necessity.`, l.id, chartside);
    }
    const sex = SEX_SPECIFIC[l.cpt];
    if (sex && ctx.sex !== "X" && ctx.sex !== sex) add("error", "sex-edit", `${l.cpt} is inconsistent with the patient's sex.`, l.id, chartside);
    if (/^9939[5-7]$/.test(l.cpt)) {
      const expect = ctx.age >= 65 ? "99397" : ctx.age >= 40 ? "99396" : "99395";
      if (l.cpt !== expect) add("error", "age-edit", `${l.cpt} does not match the patient's age (${ctx.age}); use ${expect}.`, l.id, chartside);
    }
    if (l.cpt === "99406" && !/minute|min\b/i.test(l.rationale)) add("warning", "time-documentation", "Tobacco cessation counseling (99406) requires documented counseling time of at least 3 minutes.", l.id, chartside);
  }
  const counts = new Map<string, number>();
  for (const l of claim.lines) counts.set(`${l.cpt}|${l.modifiers.join(",")}`, (counts.get(`${l.cpt}|${l.modifiers.join(",")}`) ?? 0) + 1);
  for (const [k, c] of counts) if (c > 1) add("error", "duplicate-line", `${k.split("|")[0]} is billed ${c} times; combine into one line with units.`, undefined, chartside);

  if (em) {
    const hasSeparate = claim.lines.some((l) => ["procedure", "vaccine_admin"].includes(l.source) && l.cpt !== "36415") || claim.lines.some((l) => /^(9939\d|G043[89])$/.test(l.cpt));
    if (hasSeparate && !em.modifiers.includes("25")) add("error", "modifier-25", `${em.cpt} is billed with a same-day procedure, vaccine administration, or preventive visit and needs modifier 25.`, em.id, { set: "CMS", version: "NCCI Policy Manual Ch. XI", ref: "Significant, separately identifiable E/M" });
    if (coding) {
      const lastDigit = (c: string) => Number(c.slice(-1));
      const expected = coding.em.code;
      const timeCode = coding.em.timeBased?.code;
      if (lastDigit(em.cpt) > lastDigit(expected) && em.cpt !== timeCode) add("error", "em-level", `${em.cpt} exceeds the documented MDM (${coding.em.level}, supports ${expected}). Document time or lower the level.`, em.id, { set: "AMA/CMS E/M guidelines", version: "2021 office MDM table" });
    }
    const newCode = /^9920\d$/.test(em.cpt);
    const priorSeen = (ctx.chart?.priorVisits ?? []).some((v) => (Date.now() - new Date(v.date).getTime()) / 86400000 < 3 * 365);
    if (newCode && priorSeen) add("error", "new-patient", `${em.cpt} is a new-patient code, but the patient was seen within 3 years; use an established-patient code.`, em.id, { set: "CMS", version: "Medicare Claims Processing Manual Ch. 12 §30.6.7" });
    if (ctx.setting === "telehealth" && !em.modifiers.includes("95") && claim.placeOfService !== "10" && claim.placeOfService !== "02") add("warning", "telehealth", "Telehealth visits need place of service 02 or 10 (and modifier 95 for most commercial payers).", em.id);
  }
  if (facts) {
    const definitive = claim.dx.filter((d) => !d.code.startsWith("R") && !d.code.startsWith("Z"));
    for (const d of claim.dx.filter((x) => x.code.startsWith("R"))) {
      if (definitive.length) add("warning", "integral-symptom", `${d.code} (${d.label}) is a symptom code billed alongside a confirmed diagnosis; symptoms integral to the diagnosis should not be coded.`, undefined, { set: "ICD-10-CM Official Guidelines", version: "FY2026", ref: "Section I.B.5" });
    }
    if (!ctx.ref) for (const d of claim.dx) if (/unspecified (?:side|ear|knee|shoulder)/i.test(d.label)) add("warning", "laterality", `${d.code} is unspecified for laterality; document the side to code specifically.`, undefined, chartside);
  }
  if (claim.excludedOrders.length) add("info", "excluded-orders", `Not billed: ${claim.excludedOrders.join("; ")}.`);

  if (ctx.ref) for (const e of ctx.ref.review(claim, { age: ctx.age, sex: ctx.sex, minutes: ctx.minutes, chart: ctx.chart, facts })) edits.push({ ...e, id: `ed_${++n}` });

  const charges = Math.round(claim.lines.reduce((s, l) => s + l.charge, 0) * 100) / 100;
  const priced = claim.lines.filter((l) => l.pricing && l.pricing.allowed !== null);
  const allowed = ctx.ref ? Math.round(priced.reduce((s, l) => s + (l.pricing!.allowed ?? 0) * l.units, 0) * 100) / 100 : null;
  const patientResponsibility = ctx.ref ? Math.round(priced.reduce((s, l) => s + (l.pricing!.allowed ?? 0) * l.units * ((l.pricing!.coinsurance ?? 20) / 100), 0) * 100) / 100 : null;
  return { ...claim, edits, totals: { charges, lines: claim.lines.length, allowed, patientResponsibility }, ...(ctx.ref ? { reference: ctx.ref.versions() } : {}) };
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
