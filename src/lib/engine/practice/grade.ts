import { normalize } from "./intent";
import { firstName } from "./patient";
import type { PracticeCase, Turn } from "./types";

export interface ItemResult {
  id: string;
  label: string;
  weight: number;
  hit: boolean;
  at: number | null;
  turnId: string | null;
  redFlag?: boolean;
  ask: string;
}

export type CategoryKey = "history" | "exam" | "communication" | "note";

export interface Category {
  key: CategoryKey;
  label: string;
  score: number;
  got: number;
  max: number;
}

export interface EncounterGrade {
  history: ItemResult[];
  exam: ItemResult[];
  communication: ItemResult[];
}

export interface NoteGrade {
  score: number;
  facts: { id: string; label: string; weight: number; elicited: boolean; written: boolean }[];
  invented: string[];
  contradictions: string[];
  differential: { dx: string; leading: boolean; hit: boolean }[];
  plan: { label: string; weight: number; hit: boolean }[];
  parts: { documentation: number; differential: number; plan: number; penalty: number };
}

export interface Fix {
  kind: "red_flag" | "empathy" | "open" | "invented" | "dx" | "summary" | "plan" | "intro" | "exam";
  at: number | null;
  turnId: string | null;
  title: string;
  detail: string;
}

export interface Scorecard {
  overall: number;
  categories: Category[];
  encounter: EncounterGrade;
  note: NoteGrade | null;
  fixes: Fix[];
  missedRedFlags: { label: string; ask: string }[];
  historyHits: number;
  historyTotal: number;
}

export const COMMUNICATION_ITEMS: { id: string; label: string; topics: string[]; weight: number; ask: string; early?: boolean }[] = [
  { id: "intro", label: "Introduced yourself", topics: ["intro"], weight: 1, ask: "Hi, I'm Sam, a medical student working with the team today." },
  { id: "open", label: "Opened with an open-ended question", topics: ["open"], weight: 2, ask: "What brings you in today?", early: true },
  { id: "empathy", label: "Showed empathy", topics: ["empathy"], weight: 2, ask: "That sounds really hard. I'm sorry you're dealing with this." },
  { id: "concerns", label: "Asked about their concerns", topics: ["concerns"], weight: 1, ask: "What worries you most about this?" },
  { id: "summary", label: "Summarized back", topics: ["summary"], weight: 2, ask: "Let me make sure I have this right..." },
  { id: "next_steps", label: "Explained next steps", topics: ["next_steps"], weight: 1, ask: "Here's what I think we should do next..." },
];

const CATEGORY_WEIGHTS: Record<CategoryKey, number> = { history: 40, exam: 10, communication: 20, note: 30 };
const CATEGORY_LABELS: Record<CategoryKey, string> = { history: "History", exam: "Physical exam", communication: "Communication", note: "Note" };

export function hasAny(text: string, keys: string[]) {
  const t = text.startsWith(" ") ? text : normalize(text);
  return keys.some((k) => {
    const core = normalize(k).trim();
    if (!core) return false;
    return core.length <= 3 || /^\d+$/.test(core) ? t.includes(` ${core} `) : t.includes(` ${core}`);
  });
}

export function clock(s: number | null) {
  if (s === null) return "";
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

const students = (turns: Turn[]) => turns.filter((t) => t.role === "student");

function firstWith(turns: Turn[], topics: string[]) {
  return students(turns).find((t) => t.topics?.some((x) => topics.includes(x))) ?? null;
}

export function elicitedTopics(turns: Turn[]) {
  return new Set(students(turns).flatMap((t) => t.topics ?? []));
}

export function examsDone(turns: Turn[]) {
  return new Set(turns.filter((t) => t.role === "exam" && t.exam).map((t) => t.exam!));
}

export function gradeEncounter(c: PracticeCase, turns: Turn[]): EncounterGrade {
  const history = c.checklist.map((i) => {
    const t = firstWith(turns, i.topics);
    return { id: i.id, label: i.label, weight: i.weight, hit: !!t, at: t?.t ?? null, turnId: t?.id ?? null, redFlag: i.redFlag, ask: i.ask };
  });
  const exam = c.exam.map((e) => {
    const t = turns.find((x) => x.role === "exam" && x.exam === e.key) ?? null;
    return { id: e.key, label: e.label, weight: e.required ? 2 : 1, hit: !!t, at: t?.t ?? null, turnId: t?.id ?? null, ask: e.ask };
  });
  const early = students(turns).slice(0, 3);
  const communication = COMMUNICATION_ITEMS.map((i) => {
    const pool = i.early ? early : students(turns);
    const t = pool.find((x) => x.topics?.some((y) => i.topics.includes(y))) ?? null;
    return { id: i.id, label: i.label, weight: i.weight, hit: !!t, at: t?.t ?? null, turnId: t?.id ?? null, ask: i.ask };
  });
  return { history, exam, communication };
}

export function gradeNote(c: PracticeCase, turns: Turn[], note: string): NoteGrade {
  const text = normalize(note);
  const topics = elicitedTopics(turns);
  const exams = examsDone(turns);
  const facts = c.note.facts.map((f) => {
    const elicited = f.exam ? exams.has(f.exam) : f.topic ? topics.has(f.topic) || c.checklist.some((i) => i.topics.includes(f.topic!) && i.topics.some((x) => topics.has(x))) : true;
    return { id: f.id, label: f.label, weight: f.weight, elicited, written: hasAny(text, f.any) };
  });
  const invented = facts.filter((f) => f.written && !f.elicited).map((f) => f.label);
  const contradictions = (c.note.contradictions ?? []).filter((x) => hasAny(text, x.any)).map((x) => x.label);
  const differential = c.note.differential.map((d) => ({ dx: d.dx, leading: !!d.leading, hit: hasAny(text, d.any) }));
  const plan = c.note.plan.map((p) => ({ label: p.label, weight: p.weight, hit: hasAny(text, p.any) }));
  const eWeight = facts.filter((f) => f.elicited).reduce((s, f) => s + f.weight, 0);
  const documentation = eWeight ? (40 * facts.filter((f) => f.elicited && f.written).reduce((s, f) => s + f.weight, 0)) / eWeight : 0;
  const others = differential.filter((d) => !d.leading);
  const dxScore = (differential.some((d) => d.leading && d.hit) ? 20 : 0) + 10 * Math.min(1, others.filter((d) => d.hit).length / 2);
  const planMax = plan.reduce((s, p) => s + p.weight, 0);
  const planScore = planMax ? (30 * plan.filter((p) => p.hit).reduce((s, p) => s + p.weight, 0)) / planMax : 0;
  const penalty = Math.min(20, 5 * (invented.length + contradictions.length));
  const score = note.trim() ? Math.max(0, Math.min(100, Math.round(documentation + dxScore + planScore - penalty))) : 0;
  return { score, facts, invented, contradictions, differential, plan, parts: { documentation: Math.round(documentation), differential: Math.round(dxScore), plan: Math.round(planScore), penalty } };
}

function pct(items: ItemResult[]) {
  const max = items.reduce((s, i) => s + i.weight, 0);
  const got = items.filter((i) => i.hit).reduce((s, i) => s + i.weight, 0);
  return { got, max, score: max ? Math.round((100 * got) / max) : 0 };
}

export function categories(enc: EncounterGrade, note: NoteGrade | null): Category[] {
  const out: Category[] = (["history", "exam", "communication"] as const).map((k) => ({ key: k, label: CATEGORY_LABELS[k], ...pct(enc[k]) }));
  if (note) out.push({ key: "note", label: CATEGORY_LABELS.note, score: note.score, got: note.score, max: 100 });
  return out;
}

export function overall(cats: Category[]) {
  const total = cats.reduce((s, c) => s + CATEGORY_WEIGHTS[c.key], 0);
  return total ? Math.round(cats.reduce((s, c) => s + CATEGORY_WEIGHTS[c.key] * c.score, 0) / total) : 0;
}

export function buildFixes(c: PracticeCase, turns: Turn[], enc: EncounterGrade, note: NoteGrade | null): Fix[] {
  const out: Fix[] = [];
  const st = students(turns);
  const firstExam = turns.find((t) => t.role === "exam");
  const lastStudent = st.at(-1) ?? null;
  const moment = firstExam ?? lastStudent;
  for (const i of enc.history.filter((h) => h.redFlag && !h.hit).sort((a, b) => b.weight - a.weight)) {
    const late = moment && moment.t >= 5 ? moment : null;
    out.push({ kind: "red_flag", at: late?.t ?? null, turnId: late?.id ?? null, title: `Missed red flag: ${i.label.toLowerCase()}`, detail: `${late ? `By ${clock(late.t)} you had ${firstExam ? "moved on to the exam" : "finished"} without asking. ` : ""}Try: "${i.ask}"` });
  }
  const who = firstName(c);
  for (let k = 0; k < turns.length; k++) {
    const cue = turns[k];
    if (cue.role !== "patient" || !cue.cue) continue;
    const next = turns.slice(k + 1).find((t) => t.role === "student");
    if (!next || next.topics?.includes("empathy")) continue;
    const quote = cue.text.length > 90 ? `${cue.text.slice(0, 87)}...` : cue.text;
    out.push({ kind: "empathy", at: cue.t, turnId: cue.id, title: "Acknowledge the emotion before moving on", detail: `At ${clock(cue.t)} ${who} said "${quote}" and the next question skipped past it. Try: "That sounds really frightening. We're going to take good care of you."` });
    break;
  }
  const open = enc.communication.find((x) => x.id === "open");
  if (open && !open.hit && st[0]) out.push({ kind: "open", at: st[0].t, turnId: st[0].id, title: "Start open-ended", detail: `At ${clock(st[0].t)} you started with a narrow question. Begin with "What brings you in today?" and let the story come first.` });
  if (note) {
    for (const f of note.invented) out.push({ kind: "invented", at: null, turnId: null, title: "Only chart what you found", detail: `Your note includes "${f}", but you never asked or examined for it in the encounter.` });
    for (const x of note.contradictions) out.push({ kind: "invented", at: null, turnId: null, title: "Your note doesn't match the patient", detail: x });
    const lead = note.differential.find((d) => d.leading);
    if (lead && !lead.hit) out.push({ kind: "dx", at: null, turnId: null, title: "Commit to a leading diagnosis", detail: `Your assessment didn't name ${lead.dx.toLowerCase()}, the most likely diagnosis here. Lead with it, then list what else you're ruling out.` });
  }
  const exam = enc.exam.filter((e) => !e.hit && e.weight > 1);
  if (exam.length) out.push({ kind: "exam", at: lastStudent?.t ?? null, turnId: lastStudent?.id ?? null, title: `Examine the ${exam.map((e) => e.label.replace(/^(Listen to|Check|Look in|Look at|Press on|Examine) /i, "").toLowerCase()).slice(0, 2).join(" and ")}`, detail: `A focused exam for this complaint includes: ${exam.map((e) => e.label.toLowerCase()).join(", ")}.` });
  const summary = enc.communication.find((x) => x.id === "summary");
  if (summary && !summary.hit && lastStudent) out.push({ kind: "summary", at: lastStudent.t, turnId: lastStudent.id, title: "Summarize before you close", detail: `Before ending at ${clock(lastStudent.t)}, recap the story in two sentences and ask "Did I get that right?"` });
  if (note) {
    const miss = note.plan.filter((p) => !p.hit).sort((a, b) => b.weight - a.weight)[0];
    if (miss) out.push({ kind: "plan", at: null, turnId: null, title: "Tighten the plan", detail: `Your plan left out: ${miss.label.toLowerCase()}.` });
  }
  const intro = enc.communication.find((x) => x.id === "intro");
  if (intro && !intro.hit && st[0]) out.push({ kind: "intro", at: st[0].t, turnId: st[0].id, title: "Introduce yourself", detail: `At ${clock(st[0].t)}, start with your name and role: "${intro.ask}"` });
  return out.slice(0, 3);
}

export function scorecard(c: PracticeCase, turns: Turn[], noteText: string | null): Scorecard {
  const encounter = gradeEncounter(c, turns);
  const note = noteText !== null && noteText.trim() ? gradeNote(c, turns, noteText) : null;
  const cats = categories(encounter, note);
  return {
    overall: overall(cats),
    categories: cats,
    encounter,
    note,
    fixes: buildFixes(c, turns, encounter, note),
    missedRedFlags: encounter.history.filter((h) => h.redFlag && !h.hit).map((h) => ({ label: h.label, ask: h.ask })),
    historyHits: encounter.history.filter((h) => h.hit).length,
    historyTotal: encounter.history.length,
  };
}
