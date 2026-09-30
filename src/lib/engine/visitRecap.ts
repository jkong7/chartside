import type { Facts, MedFact } from "./extract";
import { SYMPTOMS } from "./lexicon";
import { readingGrade } from "./text";

export interface VisitRecap {
  headline: string;
  discussed: string[];
  diagnoses: { term: string; plain: string }[];
  meds: { name: string; change: string; text: string }[];
  nextSteps: { text: string; when: string | null }[];
  questions: string[];
  watchFor: string[];
  readingGrade: number;
  source: "local" | "claude";
}

const CLASS_PLAIN: Record<string, string> = {
  "ACE inhibitor": "a blood pressure medicine",
  ARB: "a blood pressure medicine",
  "calcium channel blocker": "a blood pressure medicine",
  "thiazide diuretic": "a water pill for blood pressure",
  "loop diuretic": "a water pill",
  "beta blocker": "a heart and blood pressure medicine",
  statin: "a cholesterol medicine",
  biguanide: "a diabetes medicine",
  "SGLT2 inhibitor": "a diabetes medicine",
  "GLP-1 receptor agonist": "a diabetes and weight medicine",
  insulin: "insulin for blood sugar",
  SSRI: "a medicine for mood and anxiety",
  SNRI: "a medicine for mood and anxiety",
  "proton pump inhibitor": "a stomach acid medicine",
  NSAID: "a pain and swelling medicine",
  antibiotic: "an antibiotic for infection",
  "inhaled corticosteroid": "a lung inhaler",
  "short-acting beta agonist": "a rescue inhaler",
  anticoagulant: "a blood thinner",
  "thyroid hormone": "a thyroid medicine",
};

const CHANGE: Record<string, string> = { start: "New", stop: "Stop", increase: "Higher dose", decrease: "Lower dose", change: "Changed", continue: "Keep taking", refill: "Refilled" };

const FREQ: Record<string, string> = { daily: "once a day", "twice daily": "twice a day", "three times daily": "three times a day", "four times daily": "four times a day" };

function freq(f?: string) {
  if (!f) return "";
  let out = f;
  for (const [k, v] of Object.entries(FREQ)) out = out.replace(new RegExp(`^${k}`), v);
  return ` ${out}`;
}

function medText(m: MedFact) {
  const what = CLASS_PLAIN[m.cls] ? ` (${CLASS_PLAIN[m.cls]})` : "";
  const dose = m.dose ? ` ${m.dose}` : "";
  switch (m.action) {
    case "start": return `Start ${m.name}${dose}${freq(m.frequency)}${what}.`;
    case "stop": return `Stop taking ${m.name}${what}.`;
    case "increase": return `Take more ${m.name}: now${dose}${freq(m.frequency)}.`;
    case "decrease": return `Take less ${m.name}: now${dose}${freq(m.frequency)}.`;
    case "change": return `Switch to ${m.name}${dose}${freq(m.frequency)}${what}.`;
    case "continue": return `Keep taking ${m.name}${freq(m.frequency)}${what}.`;
    case "refill": return `Your doctor refilled ${m.name}.`;
    default: return "";
  }
}

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, twelve: 12 };

export function approxDate(interval: string | undefined, from: Date) {
  const m = /(\d+|a|an|one|two|three|four|five|six|eight|twelve)\s*-?\s*(day|week|month|year)s?/i.exec(interval ?? "");
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()] ?? 1;
  const d = new Date(from.getTime() + n * UNIT_DAYS[m[2].toLowerCase()] * 86400000);
  const unit = m[2].toLowerCase();
  const opts: Intl.DateTimeFormatOptions = unit === "day" || unit === "week" ? { weekday: "long", month: "long", day: "numeric" } : { month: "long", year: "numeric" };
  return `${unit === "day" || unit === "week" ? "around" : "in"} ${d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })}`;
}

function orderText(o: Facts["orders"][number]) {
  const name = o.name.replace(/^Referral to /, "");
  switch (o.kind) {
    case "lab": return `Get a lab test: ${name}.`;
    case "imaging": return `Get an imaging test: ${name}.`;
    case "referral": return `See a specialist: ${name}. The office should call you to set it up.`;
    case "vaccine": return `Get a vaccine: ${name}.`;
    default: return `Test or procedure: ${name}.`;
  }
}

function toYou(s: string) {
  return s.replace(/^Counseled (?:the patient )?(?:to|on) /i, "").replace(/\btheir\b/g, "your").replace(/\bthey\b/g, "you").replace(/\bthe patient\b/gi, "you").replace(/\bpatient\b/g, "you").replace(/^./, (c) => c.toUpperCase());
}

export function buildVisitRecap(facts: Facts, opts: { clinician?: string | null; recordedAt?: Date } = {}): VisitRecap {
  const at = opts.recordedAt ?? new Date();
  const who = opts.clinician?.trim() || "Your clinician";
  const discussed: string[] = [];
  const diagnoses: VisitRecap["diagnoses"] = [];
  const chronic = new Set<string>();
  for (const p of facts.problems) {
    const said = p.def?.plain.en ?? (p.fromSymptom ? SYMPTOMS.find((s) => `sym_${s.key}` === p.key)?.plain.en : undefined) ?? p.label.toLowerCase();
    const plain = said.replace(/^(?:a|an|the) /, "");
    if (p.chronic && !p.fromSymptom) chronic.add(plain);
    if (p.fromSymptom) discussed.push(`You talked about your ${plain}.`);
    else {
      diagnoses.push({ term: p.label, plain });
      if (p.status === "not at goal") discussed.push(`Your ${plain} is not where it should be yet, so the plan is changing.`);
      else if (p.status === "improving") discussed.push(`Your ${plain} is getting better.`);
      else if (p.status === "stable" || p.chronic) discussed.push(`Your ${plain} came up, and it sounds stable.`);
      else discussed.push(`${who === "Your clinician" ? "Your clinician" : who} thinks this may be ${said}.`);
    }
  }
  if (!discussed.length && facts.chiefComplaint) discussed.push(`You came in about ${facts.chiefComplaint.label.toLowerCase()}.`);

  const seen = new Set<string>();
  const meds: VisitRecap["meds"] = [];
  for (const m of facts.meds) {
    if (m.cancelled || !CHANGE[m.action]) continue;
    const k = `${m.name}:${m.action}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const text = medText(m);
    if (text) meds.push({ name: m.name, change: CHANGE[m.action], text });
  }
  meds.sort((a, b) => Number(a.change === "Keep taking") - Number(b.change === "Keep taking"));

  const nextSteps: VisitRecap["nextSteps"] = facts.orders.map((o) => ({ text: orderText(o), when: approxDate(o.detail, at) ?? (o.detail && /today/i.test(o.detail) ? "today" : null) }));
  for (const c of facts.counseling) nextSteps.push({ text: toYou(c.text).replace(/\.?$/, "."), when: null });
  if (facts.followUp?.interval) nextSteps.push({ text: `Come back for a follow-up visit in ${facts.followUp.interval}.`, when: approxDate(facts.followUp.interval, at) });

  const questions: string[] = [];
  for (const m of meds.filter((x) => x.change === "New" || x.change === "Higher dose" || x.change === "Changed")) questions.push(`What side effects should I watch for with ${m.name}?`);
  const tests = facts.orders.filter((x) => x.kind === "lab" || x.kind === "imaging");
  if (tests.length) questions.push(tests.length === 1 ? `When and how will I get the results of my ${tests[0].name}?` : "When and how will I get my test results?");
  for (const d of diagnoses.filter((x) => chronic.has(x.plain)).slice(0, 2)) questions.push(`What is the goal for my ${d.plain}, and how will we know it's working?`);
  for (const q of facts.patientQuestions.slice(0, 2)) questions.push(`Follow up on what you asked: "${q.text.replace(/\s+/g, " ").slice(0, 120)}"`);
  if (!questions.length) questions.push("Is there anything I should watch for before my next visit?", "Who do I call if I have questions after today?");

  const watchFor: string[] = [];
  for (const p of facts.problems) for (const x of p.def?.precautions?.en ?? []) if (!watchFor.includes(x)) watchFor.push(x);
  watchFor.push("Call 911 for any emergency.");

  const changes = meds.filter((m) => m.change !== "Keep taking").length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const headline = diagnoses.length || meds.length || nextSteps.length
    ? `You saw ${who === "Your clinician" ? "your clinician" : who}${diagnoses.length ? ` about your ${diagnoses.slice(0, 2).map((d) => d.plain).join(" and ")}` : ""}. ${changes ? plural(changes, "medicine change") : "No medicine changes"}, and ${plural(nextSteps.length, "thing")} to do next.`
    : "Here is what we heard in your visit.";
  const body = [headline, ...discussed, ...meds.map((m) => m.text), ...nextSteps.map((n) => n.text)].join(" ");
  return { headline, discussed, diagnoses, meds, nextSteps, questions: questions.slice(0, 6), watchFor, readingGrade: readingGrade(body), source: "local" };
}

export function recapText(r: VisitRecap, notes?: string) {
  const out: string[] = [r.headline, ""];
  const block = (title: string, items: string[]) => {
    if (!items.length) return;
    out.push(title.toUpperCase(), ...items.map((i) => `- ${i}`), "");
  };
  block("What you talked about", r.discussed);
  block("Diagnoses in plain words", r.diagnoses.map((d) => `${d.plain} (${d.term})`));
  block("Your medicines", r.meds.map((m) => m.text));
  block("What to do next", r.nextSteps.map((n) => (n.when ? `${n.text.replace(/\.$/, "")}, ${n.when}.` : n.text)));
  block("Questions to ask next time", r.questions);
  block("Get help right away if", r.watchFor);
  if (notes?.trim()) block("Your own notes", notes.trim().split(/\n+/));
  return out.join("\n").trim();
}
