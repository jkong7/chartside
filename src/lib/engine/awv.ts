import type { Chart, NoteSentence, Utterance } from "../types";

export interface AwvElement {
  key: string;
  label: string;
  required: boolean;
  re: RegExp;
}

export const AWV_ELEMENTS: AwvElement[] = [
  { key: "hra", label: "Health risk assessment reviewed", required: true, re: /\b(?:health risk assessment|HRA|questionnaire you filled|wellness questionnaire)\b/i },
  { key: "history", label: "Medical, surgical, and family history updated", required: true, re: /\b(?:family history|surgeries|past (?:medical )?history|any new (?:diagnoses|conditions))\b/i },
  { key: "providers", label: "Current providers and suppliers listed", required: true, re: /\b(?:other (?:doctors|specialists|providers)|who else (?:do you see|is involved)|your (?:cardiologist|pharmacist|pharmacy|specialists?)|medical equipment|home health)\b/i },
  { key: "measurements", label: "Height, weight or BMI, and blood pressure", required: true, re: /\b(?:blood pressure|BMI|weigh(?:t|s)?)\b/i },
  { key: "cognitive", label: "Cognitive assessment", required: true, re: /\b(?:memory|mini-?cog|clock (?:draw|drawing|test)|three words|cognitive|confus(?:ed|ion))\b/i },
  { key: "depression", label: "Depression screen", required: true, re: /\b(?:PHQ-?[29]|depress(?:ed|ion)|down,? depressed|hopeless|little interest)\b/i },
  { key: "functional", label: "Functional ability and home safety", required: true, re: /\b(?:falls?|fallen|hearing|bath(?:e|ing)|dress(?:ing)?|grab bars?|rugs|home safety|driving|stairs|walker|cane)\b/i },
  { key: "schedule", label: "Written screening schedule for the next 5 to 10 years", required: true, re: /\b(?:screening schedule|due for (?:your|a)|colonoscopy|mammogram|bone density|DEXA|next (?:screening|colonoscopy))\b/i },
  { key: "advice", label: "Personalized health advice and referrals", required: true, re: /\b(?:exercise|walk(?:ing)?|diet|quit(?:ting)?|fall prevention|balance class|refer(?:ral)?|nutrition)\b/i },
  { key: "acp", label: "Advance care planning (optional)", required: false, re: /\b(?:advance directive|living will|(?:health ?care )?power of attorney|health ?care proxy|POLST|end[- ]of[- ]life|code status|what matters most)\b/i },
];

export interface AwvResult {
  subsequent: boolean;
  elements: { key: string; label: string; required: boolean; done: boolean; evidence: string[] }[];
  acpMinutes: number | null;
  depressionScreened: boolean;
}

export function awvReview(utts: Utterance[], chart: Chart | null | undefined, facts: { vitals: { name: string }[] }): AwvResult {
  const subsequent = (chart?.priorVisits ?? []).some((v) => /annual wellness|AWV|G043[89]/i.test(v.summary));
  const elements = AWV_ELEMENTS.map((e) => {
    const hits = utts.filter((u) => e.re.test(u.text));
    const done = e.key === "measurements" ? facts.vitals.some((v) => v.name === "BP") && facts.vitals.some((v) => v.name === "Weight" || v.name === "BMI") : hits.length > 0;
    return { key: e.key, label: e.label, required: e.required, done, evidence: hits.map((u) => u.id).slice(0, 3) };
  });
  let acpMinutes: number | null = null;
  for (const u of utts) {
    const m = /\b(\d{1,2})\s+minutes?\b[^.]*\b(?:advance care planning|advance directives?|living will|end[- ]of[- ]life)\b|\b(?:advance care planning|advance directives?)\b[^.]*?\b(\d{1,2})\s+minutes?\b/i.exec(u.text);
    if (m) acpMinutes = Number(m[1] ?? m[2]);
  }
  return { subsequent, elements, acpMinutes, depressionScreened: elements.find((e) => e.key === "depression")!.done };
}

export interface ScreeningDue {
  name: string;
  status: "due" | "up to date" | "discuss";
  detail: string;
}

const yearsSince = (date: string | undefined, at: Date) => (date ? (at.getTime() - new Date(date).getTime()) / (365.25 * 86400000) : null);

export function screeningSchedule(age: number, sex: string, chart: Chart | null | undefined, at: Date): ScreeningDue[] {
  const last = (re: RegExp) => [...(chart?.screenings ?? [])].filter((s) => re.test(s.name)).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const imm = (re: RegExp) => [...(chart?.immunizations ?? [])].filter((s) => re.test(s.name)).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const out: ScreeningDue[] = [];
  const add = (name: string, applies: boolean, lastDate: string | undefined, everyYears: number | null, detail: string) => {
    if (!applies) return;
    const y = yearsSince(lastDate, at);
    const due = y === null || (everyYears !== null && y >= everyYears);
    out.push({ name, status: due ? "due" : "up to date", detail: lastDate ? `${detail}; last ${lastDate}` : detail });
  };
  const colon = last(/colonoscopy|FIT|cologuard|stool/i);
  add("Colorectal cancer screening", age >= 45 && age <= 75, colon?.date, colon && /colonoscopy/i.test(colon.name) ? 10 : colon && /cologuard/i.test(colon.name) ? 3 : 1, "Ages 45 to 75");
  add("Breast cancer screening (mammogram)", sex === "F" && age >= 40 && age <= 74, last(/mammo/i)?.date, 2, "Every 2 years, ages 40 to 74");
  add("Osteoporosis screening (DEXA)", sex === "F" && age >= 65, last(/dexa|bone density/i)?.date, null, "Women 65 and older");
  add("Abdominal aortic aneurysm ultrasound", sex === "M" && age >= 65 && age <= 75 && chart?.smoking !== "never", last(/aaa|aortic/i)?.date, null, "Men 65 to 75 who ever smoked, once");
  add("Lung cancer screening (low-dose CT)", age >= 50 && age <= 80 && chart?.smoking === "current", last(/low-?dose ct|ldct|lung cancer screen/i)?.date, 1, "Ages 50 to 80 with a 20 pack-year history; confirm pack-years");
  add("Hepatitis C screening", age >= 18 && age <= 79, last(/hep(?:atitis)? ?c/i)?.date, null, "Once, ages 18 to 79");
  const flu = imm(/influenza|flu/i)?.date;
  const seasonStart = new Date(at.getMonth() >= 7 ? at.getFullYear() : at.getFullYear() - 1, 7, 1);
  out.push({ name: "Influenza vaccine", status: flu && new Date(flu) >= seasonStart ? "up to date" : "due", detail: flu ? `Every season (from August); last ${flu}` : "Every season (from August)" });
  add("Pneumococcal vaccine", age >= 50, imm(/pneumo|prevnar|pcv/i)?.date, null, "PCV20 or PCV21 once at 50 or older");
  add("Shingles vaccine (recombinant)", age >= 50, imm(/zoster|shingrix|shingles/i)?.date, null, "Two doses at 50 or older");
  add("Tetanus booster (Td or Tdap)", true, imm(/tdap|td\b|tetanus/i)?.date, 10, "Every 10 years");
  return out;
}

export function awvSentences(r: AwvResult, key: string): NoteSentence[] {
  const missing = r.elements.filter((e) => e.required && !e.done);
  const out: NoteSentence[] = [{ id: `${key}_1`, text: `${r.subsequent ? "Subsequent" : "Initial"} annual wellness visit (${r.subsequent ? "G0439" : "G0438"}): ${r.elements.filter((e) => e.required && e.done).length} of ${r.elements.filter((e) => e.required).length} required elements documented.`, evidence: [], kind: "system", support: "strong" }];
  for (const e of r.elements.filter((x) => x.done)) out.push({ id: `${key}_${out.length + 1}`, text: `${e.label}: done.`, evidence: e.evidence, kind: "fact", support: "strong" });
  for (const e of missing) out.push({ id: `${key}_${out.length + 1}`, text: `${e.label}: ***`, evidence: [], kind: "system", support: "none" });
  return out;
}

export function scheduleSentences(items: ScreeningDue[], key: string): NoteSentence[] {
  return items.map((s, i) => ({ id: `${key}_${i + 1}`, text: `${s.name}: ${s.status} (${s.detail}).`, evidence: [], kind: "system", support: "strong" }));
}

export function acpSentences(r: AwvResult, key: string): NoteSentence[] {
  const acp = r.elements.find((e) => e.key === "acp")!;
  if (!acp.done) return [{ id: `${key}_1`, text: "Advance care planning was not discussed today.", evidence: [], kind: "system", support: "strong" }];
  return [{ id: `${key}_1`, text: r.acpMinutes ? `Advance care planning discussed voluntarily for ${r.acpMinutes} minutes${r.acpMinutes >= 16 ? " (supports 99497 with modifier 33)" : " (under 16 minutes; not separately billable)"}.` : "Advance care planning discussed; document the time spent (***) to bill 99497.", evidence: acp.evidence, kind: r.acpMinutes ? "fact" : "system", support: r.acpMinutes ? "strong" : "none" }];
}
