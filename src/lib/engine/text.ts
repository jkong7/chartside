const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2, few: 3, several: 4,
};

export function wordToNumber(s: string): number | null {
  const t = s.toLowerCase().replace(/^a\s+/, "").trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  if (/^a few$/.test(s.toLowerCase())) return 3;
  return null;
}

export function splitClauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\s+(?:but|and then|although|though)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function sentenceCase(s: string) {
  const t = s.trim();
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}

export function ensurePeriod(s: string) {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : t + ".";
}

export function joinList(items: string[], conj = "and") {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs.join("");
  if (xs.length === 2) return `${xs[0]} ${conj} ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, ${conj} ${xs[xs.length - 1]}`;
}

export function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

const STOP = new Set(
  "a an the and or of to in on for with at by from is are was were be been being it its this that these those i you he she they we me my your his her their our patient pt has have had do does did not no so as if but about over than then there here very just really also".split(" "),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9./ ]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/\.$/, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function stem(t: string) {
  return t.replace(/(ing|ed|es|s)$/, "");
}

export function overlap(a: string, b: string): number {
  const ta = unique(tokens(a).map(stem));
  if (!ta.length) return 0;
  const tb = new Set(tokens(b).map(stem));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / ta.length;
}

export function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function readingGrade(text: string) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (!sentences.length || !words.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
  return Math.max(1, Math.round(grade * 10) / 10);
}

export function ageFrom(dob: string, at = new Date()) {
  const d = new Date(dob);
  let age = at.getFullYear() - d.getFullYear();
  const m = at.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < d.getDate())) age--;
  return age;
}

export function toThirdPerson(text: string, pron: Pronouns): string {
  let t = " " + text.trim() + " ";
  const rules: [RegExp, string][] = [
    [/\bI'm\b/gi, `${pron.subj} ${pron.be}`],
    [/\bI am\b/gi, `${pron.subj} ${pron.be}`],
    [/\bI've\b/gi, `${pron.subj} ${pron.have}`],
    [/\bI have\b/gi, `${pron.subj} ${pron.have}`],
    [/\bI was\b/gi, `${pron.subj} ${pron.was}`],
    [/\bI'll\b/gi, `${pron.subj} will`],
    [/\bI'd\b/gi, `${pron.subj} would`],
    [/\bI don't\b/gi, `${pron.subj} ${pron.doesnt}`],
    [/\bI do\b/gi, `${pron.subj} ${pron.does}`],
    [/\bI\b/g, pron.subj],
    [/\bmy\b/gi, pron.poss],
    [/\bme\b/gi, pron.obj],
    [/\bmyself\b/gi, pron.refl],
    [/\bmine\b/gi, pron.possPro],
  ];
  for (const [re, rep] of rules) t = t.replace(re, rep);
  t = t.replace(/\b(she|he|they) (take|drink|smoke|work|live|walk|eat|feel|get|go|use|exercise|run)\b/gi, (_m, s: string, v: string) =>
    s.toLowerCase() === "they" ? `${s} ${v}` : `${s} ${v === "go" ? "goes" : v + "s"}`,
  );
  return sentenceCase(t.trim().replace(/^(um|uh|so|well|yeah|okay|oh),?\s+/i, ""));
}

export function clinicianToNote(text: string): string {
  let t = text.trim();
  t = t.replace(/^(okay|alright|all right|so|well|now|and|um|uh|great|good),?\s+/i, "");
  t = t.replace(/^(?:I'm going to|I am going to|let me|let's|I'll|I want to)\s+(?:take a (?:quick )?(?:listen|look)(?: at)?|check|feel|examine|press on)\s*/i, "");
  t = t.replace(/\byour\b/gi, "the").replace(/\byou're\b/gi, "patient is").replace(/\byou\b/gi, "patient");
  return ensurePeriod(sentenceCase(t));
}

export interface Pronouns {
  subj: string;
  obj: string;
  poss: string;
  possPro: string;
  refl: string;
  be: string;
  have: string;
  was: string;
  does: string;
  doesnt: string;
}

export function pronounsFor(pronouns: string, sex: string): Pronouns {
  const p = pronouns.toLowerCase();
  if (p.startsWith("she") || (!p && sex === "F"))
    return { subj: "she", obj: "her", poss: "her", possPro: "hers", refl: "herself", be: "is", have: "has", was: "was", does: "does", doesnt: "does not" };
  if (p.startsWith("he") || (!p && sex === "M"))
    return { subj: "he", obj: "him", poss: "his", possPro: "his", refl: "himself", be: "is", have: "has", was: "was", does: "does", doesnt: "does not" };
  return { subj: "they", obj: "them", poss: "their", possPro: "theirs", refl: "themselves", be: "are", have: "have", was: "were", does: "do", doesnt: "do not" };
}
