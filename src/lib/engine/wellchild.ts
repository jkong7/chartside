import type { NoteSentence, Utterance } from "../types";

export interface ScreenDef {
  key: string;
  label: string;
  cpt: string;
  dueAtMonths: (m: number) => boolean;
  done: RegExp;
  note?: string;
}

const at = (...ages: number[]) => (m: number) => ages.some((a) => Math.abs(m - a) <= (a < 24 ? 1 : 3));
const years = (...ys: number[]) => at(...ys.map((y) => y * 12));

export const SCREENS: ScreenDef[] = [
  { key: "maternal_dep", label: "Maternal depression screen (Edinburgh or PHQ-9)", cpt: "96161", dueAtMonths: at(1, 2, 4, 6), done: /\b(?:edinburgh|EPDS|postpartum depression (?:screen|questionnaire)|PHQ-?9 (?:for|from) (?:mom|mother))\b/i, note: "Billed on the infant's claim" },
  { key: "developmental", label: "Developmental screen (ASQ or similar)", cpt: "96110", dueAtMonths: at(9, 18, 30), done: /\b(?:ASQ|ages and stages|developmental (?:screen|questionnaire)|PEDS questionnaire|SWYC)\b/i },
  { key: "autism", label: "Autism screen (M-CHAT-R/F)", cpt: "96110", dueAtMonths: at(18, 24), done: /\bM-?CHAT\b|\bautism screen/i },
  { key: "hgb", label: "Hemoglobin or hematocrit", cpt: "85018", dueAtMonths: at(12), done: /\b(?:hemoglobin|hematocrit|hgb|finger ?stick)\b/i },
  { key: "lead", label: "Blood lead level", cpt: "83655", dueAtMonths: at(12, 24), done: /\blead (?:level|test|screen)/i, note: "Required at 12 and 24 months for Medicaid" },
  { key: "fluoride", label: "Fluoride varnish", cpt: "99188", dueAtMonths: (m) => m >= 6 && m <= 66, done: /\bfluoride varnish\b|\bpainted (?:the |her |his )?teeth\b/i },
  { key: "vision", label: "Vision screen", cpt: "99173", dueAtMonths: (m) => [3, 4, 5, 6, 8, 10, 12, 15].some((y) => Math.abs(m - y * 12) <= 6), done: /\b(?:vision (?:screen|test|check)|eye chart|snellen|photoscreen)/i },
  { key: "hearing", label: "Hearing screen (audiometry)", cpt: "92551", dueAtMonths: (m) => [4, 5, 6, 8, 10].some((y) => Math.abs(m - y * 12) <= 6) || (m >= 132 && m < 180), done: /\b(?:hearing (?:screen|test|check)|audiometry|audiogram)\b/i },
  { key: "phq_a", label: "Depression screen (PHQ-A)", cpt: "96127", dueAtMonths: (m) => m >= 144, done: /\bPHQ(?:-?A|-?9|-?2)\b/i },
  { key: "lipid", label: "Lipid screen", cpt: "80061", dueAtMonths: (m) => (m >= 108 && m < 132) || (m >= 204 && m < 252), done: /\b(?:lipid|cholesterol) (?:panel|screen|check)\b/i },
];

export const GUIDANCE: [number, number, string[]][] = [
  [0, 6, ["Safe sleep: back to sleep, own crib, no loose bedding", "Rear-facing car seat", "Feeding cues and vitamin D for breastfed infants"]],
  [6, 12, ["Introduce solids and allergenic foods", "Childproofing and poison control number", "Brush teeth with a smear of fluoride toothpaste"]],
  [12, 36, ["Rear-facing car seat as long as possible", "Water safety and supervision", "Limit screen time; read together daily"]],
  [36, 72, ["Booster seat and helmet use", "Healthy snacks and daily activity", "School readiness and sleep routines"]],
  [72, 144, ["Seat belt in the back seat until 13", "Bullying, friendships, and screen limits", "Sports safety and physical activity"]],
  [144, 264, ["Mental health, stress, and who to talk to", "Substance use, vaping, and driving safety", "Sexual health and confidential care"]],
];

export interface WellChildResult {
  ageMonths: number;
  due: { key: string; label: string; cpt: string; done: boolean; evidence: string[]; note?: string }[];
  guidance: { topic: string; covered: boolean; evidence: string[] }[];
}

const TOPIC_WORDS: Record<string, RegExp> = {
  "Safe sleep": /\b(?:sleep on (?:her|his|their) back|back to sleep|crib|safe sleep)\b/i,
  "Rear-facing car seat": /\bcar ?seat\b/i,
  "Feeding cues": /\b(?:feeding|breastfeed|formula|vitamin d)\b/i,
  "Introduce solids": /\b(?:solids|peanut|egg|purees?|baby food)\b/i,
  Childproofing: /\b(?:childproof|poison|outlet covers|baby gates?)\b/i,
  "Brush teeth": /\b(?:brush|toothpaste|teeth)\b/i,
  "Water safety": /\b(?:water safety|pool|bath(?:tub)?|swim)\b/i,
  "Limit screen time": /\b(?:screen time|screens|read(?:ing)? together|books?)\b/i,
  "Booster seat": /\b(?:booster|helmet)\b/i,
  "Healthy snacks": /\b(?:snacks?|vegetables|juice|activity|play outside)\b/i,
  "School readiness": /\b(?:school|kindergarten|bedtime|sleep routine)\b/i,
  "Seat belt": /\b(?:seat ?belt|back seat)\b/i,
  Bullying: /\b(?:bully|bullying|friends)\b/i,
  "Sports safety": /\b(?:sports?|concussion|exercise)\b/i,
  "Mental health": /\b(?:stress|anxious|mood|mental health|talk to)\b/i,
  "Substance use": /\b(?:vaping|vape|alcohol|drugs|driving|drive)\b/i,
  "Sexual health": /\b(?:sexual|sex|contracept|confidential)\b/i,
};

export function wellChild(ageMonths: number, utts: Utterance[]): WellChildResult {
  const due = SCREENS.filter((s) => s.dueAtMonths(ageMonths)).map((s) => {
    const hits = utts.filter((u) => s.done.test(u.text) && !/\b(?:next (?:visit|time)|at (?:the )?\d+ (?:month|year))/i.test(u.text));
    return { key: s.key, label: s.label, cpt: s.cpt, done: hits.length > 0, evidence: hits.map((u) => u.id), note: s.note };
  });
  const band = GUIDANCE.find(([lo, hi]) => ageMonths >= lo && ageMonths < hi)?.[2] ?? [];
  const guidance = band.map((topic) => {
    const key = Object.keys(TOPIC_WORDS).find((k) => topic.startsWith(k));
    const hits = key ? utts.filter((u) => u.speaker === "clinician" && TOPIC_WORDS[key].test(u.text)) : [];
    return { topic, covered: hits.length > 0, evidence: hits.map((u) => u.id) };
  });
  return { ageMonths, due, guidance };
}

export function pediatricPreventive(ageYears: number, patientType: "new" | "established") {
  const band = ageYears < 1 ? 0 : ageYears < 5 ? 1 : ageYears < 12 ? 2 : ageYears < 18 ? 3 : ageYears < 40 ? 4 : ageYears < 65 ? 5 : 6;
  return `99${patientType === "new" ? 38 : 39}${band + 1}`;
}

export function screenSentences(r: WellChildResult, key: string): NoteSentence[] {
  if (!r.due.length) return [{ id: `${key}_1`, text: "No periodic screenings due at this age.", evidence: [], kind: "system", support: "strong" }];
  return r.due.map((d, i) => ({ id: `${key}_${i + 1}`, text: d.done ? `${d.label}: completed (${d.cpt}).` : `${d.label}: due at this visit, not documented. ***`, evidence: d.evidence, kind: d.done ? "fact" : "system", support: d.done ? "strong" : "none" }));
}

export function guidanceSentences(r: WellChildResult, key: string): NoteSentence[] {
  const covered = r.guidance.filter((g) => g.covered);
  const out: NoteSentence[] = covered.map((g, i) => ({ id: `${key}_${i + 1}`, text: `Discussed: ${g.topic}.`, evidence: g.evidence, kind: "fact", support: "strong" }));
  const left = r.guidance.filter((g) => !g.covered);
  if (left.length) out.push({ id: `${key}_${out.length + 1}`, text: `Age-appropriate guidance not yet covered: ${left.map((g) => g.topic.split(":")[0]).join("; ")}.`, evidence: [], kind: "system", support: "strong", pending: true });
  return out;
}
