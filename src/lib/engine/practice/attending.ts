import { hasAny } from "./grade";
import { normalize } from "./intent";
import type { PracticeCase } from "./types";

export interface PresentationItem {
  key: "opening" | "order" | "positives" | "negatives" | "assessment" | "plan" | "length";
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface PresentationGrade {
  score: number;
  items: PresentationItem[];
  words: number;
  seconds: number;
  fixes: string[];
}

export interface PimpResult {
  q: string;
  given: string;
  ok: boolean;
  answer: string;
}

const EXAM_MARKERS = ["on exam", "exam", "vitals", "vital signs", "physical", "blood pressure", "bp", "afebrile", "febrile to", "heart rate", "tachycardic", "hypertensive", "saturating", "room air"];
const ASSESS_MARKERS = ["assessment", "most likely", "leading", "consistent with", "concern for", "concerned for", "concerning for", "impression", "i think", "differential", "likely", "suspect", "this is", "not at goal", "diagnosis"];
const PLAN_MARKERS = ["plan", "i would", "i'd", "we will", "we'll", "start", "order", "get a", "check", "give", "admit", "refer", "consult"];
const COMMIT = ["most likely", "leading", "consistent with", "i think", "likely", "suspect", "concerned for", "concern for", "concerning for", "probably", "this is"];

function firstIndex(text: string, keys: string[], from = 0) {
  let best = -1;
  for (const k of keys) {
    const i = text.indexOf(` ${normalize(k).trim()}`, from);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

function round(n: number) {
  return Math.round(n * 2) / 2;
}

export function gradePresentation(c: PracticeCase, text: string, seconds: number): PresentationGrade {
  const t = normalize(text);
  const words = t.trim() ? t.trim().split(" ").length : 0;
  const cc = c.note.facts.find((f) => f.id === "cc")?.any ?? [c.title];
  const plain = text.replace(/\b(Mr|Mrs|Ms|Dr|St)\./g, "$1");
  const firstRaw = plain.split(/(?<=[.!?])\s/)[0] ?? "";
  const first = normalize(firstRaw);
  const ageSaid = hasAny(first, [String(c.patient.age), "year old", "month old", "yo"]);
  const ccFirst = hasAny(first, cc);
  const ccEarly = hasAny(t.split(" ").slice(0, 40).join(" "), cc);
  const opening = ageSaid && ccFirst ? 2 : ccEarly ? 1 : 0;
  const body = normalize(plain.slice(firstRaw.length));
  let from = 0;
  let steps = 0;
  for (const markers of [EXAM_MARKERS, ASSESS_MARKERS, PLAN_MARKERS]) {
    const i = firstIndex(body, markers, from);
    if (i < 0) continue;
    steps++;
    from = i + 1;
  }
  const order = body.trim() && steps === 3 ? 2 : body.trim() && steps === 2 ? 1 : 0;
  const pos = c.note.facts.filter((f) => f.kind === "pos");
  const neg = c.note.facts.filter((f) => f.kind === "neg");
  const posHit = pos.filter((f) => hasAny(t, f.any));
  const negHit = neg.filter((f) => hasAny(t, f.any));
  const positives = pos.length ? (2 * posHit.length) / pos.length : 2;
  const negatives = neg.length ? (1.5 * negHit.length) / neg.length : 1.5;
  const lead = c.note.differential.find((d) => d.leading)!;
  const named = hasAny(t, lead.any);
  const assessment = named && hasAny(t, COMMIT) ? 1.5 : named ? 0.75 : 0;
  const planHits = c.note.plan.filter((p) => hasAny(t, p.any));
  const planPts = planHits.length >= 2 ? 1 : planHits.length ? 0.5 : 0;
  const long = words > 450 || seconds > 180;
  const items: PresentationItem[] = [
    { key: "opening", label: "Opens with age and chief complaint", points: opening, max: 2, detail: opening === 2 ? "Your first sentence told the listener who and why." : `Lead with one line: "${c.patient.name.split(" ")[0]} is a ${c.patient.age}-year-old with ${cc[0]}."` },
    { key: "order", label: "Standard order: story, history, exam, assessment, plan", points: order, max: 2, detail: order === 2 ? "Easy to follow." : "Keep the order: HPI, then history, then exam, then assessment and plan." },
    { key: "positives", label: "Pertinent positives", points: round(positives), max: 2, detail: posHit.length === pos.length ? "You covered the key positives." : `Missing: ${pos.filter((f) => !posHit.includes(f)).map((f) => f.label.toLowerCase()).slice(0, 3).join("; ")}.` },
    { key: "negatives", label: "Pertinent negatives", points: round(negatives), max: 1.5, detail: negHit.length === neg.length ? "Good negatives." : `Say what's absent too: ${neg.filter((f) => !negHit.includes(f)).map((f) => f.label.toLowerCase()).slice(0, 3).join("; ")}.` },
    { key: "assessment", label: "Commits to a leading diagnosis", points: assessment, max: 1.5, detail: assessment === 1.5 ? `You committed to ${lead.dx.toLowerCase()}.` : named ? `Say it with conviction: "This is most likely ${lead.dx.toLowerCase()}."` : `Name your leading diagnosis. Here it's ${lead.dx.toLowerCase()}.` },
    { key: "plan", label: "Specific plan", points: planPts, max: 1, detail: planPts === 1 ? "Concrete next steps." : `Give specific orders, like ${c.note.plan.slice(0, 2).map((p) => p.label.toLowerCase()).join(" and ")}.` },
  ];
  if (long) items.push({ key: "length", label: "Under 3 minutes", points: -0.5, max: 0, detail: "Tighten it. Aim for 2 to 3 minutes." });
  const score = Math.max(0, Math.min(10, round(items.reduce((s, i) => s + i.points, 0))));
  const fixes = items.filter((i) => i.max > 0 && i.points < i.max).sort((a, b) => b.max - b.points - (a.max - a.points)).slice(0, 3).map((i) => i.detail);
  if (long) fixes.unshift(items.at(-1)!.detail);
  return { score, items, words, seconds: Math.round(seconds), fixes: fixes.slice(0, 3) };
}

export function gradePimp(c: PracticeCase, answers: string[]): PimpResult[] {
  return c.pimp.map((p, i) => {
    const given = (answers[i] ?? "").trim();
    return { q: p.q, given, ok: !!given && hasAny(given, p.any), answer: p.answer };
  });
}
