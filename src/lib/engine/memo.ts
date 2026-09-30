import type { Note, NoteSentence, Template, Utterance } from "../types";

export type MemoIntent = "yes" | "no" | "always" | "upload" | "note" | "other";

export type HoldStatus = "held" | "confirmed" | "discarded";

export interface MemoHoldState {
  status: HoldStatus;
  createdAt: string;
  expiresAt: string;
}

export type HoldEvent = { kind: "yes" } | { kind: "no" } | { kind: "tick" };

export const DICTATION_MIN_WORDS = 25;

const COMMANDS = /^(stop|stopall|unsubscribe|cancel|end|quit|start|unstop|yes|y|no|n|help|info|\?|commands|link|stack|open|sign|schedule|today|day|my day|status|queue|what'?s waiting|s|always|upload|big|too big)$/;

export function memoIntent(raw: string): MemoIntent {
  const body = (raw ?? "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(yes|y|yep|yeah|agreed|consented|ok yes)$/.test(body)) return "yes";
  if (/^(no|n|nope|declined|did not agree|they said no)$/.test(body)) return "no";
  if (/^always\b/.test(body) && !/\b(off|stop|no)\b/.test(body)) return "always";
  if (/^(upload|big|too big|file)$/.test(body)) return "upload";
  if (/^note\b[\s:,.-]*\S/.test(body)) return "note";
  if (!COMMANDS.test(body) && !/^(brief|morning|nudge|remind)\b/.test(body) && wordCount(body) >= DICTATION_MIN_WORDS) return "note";
  return "other";
}

export function wordCount(text: string) {
  return (text.match(/[A-Za-z0-9'][A-Za-z0-9'-]*/g) ?? []).length;
}

export function dictationText(raw: string) {
  return (raw ?? "").trim().replace(/^note\b[\s:,.-]*/i, "").trim();
}

export function nextHold(state: MemoHoldState, event: HoldEvent, at: Date = new Date()): MemoHoldState {
  if (state.status !== "held") return state;
  if (Date.parse(state.expiresAt) <= at.getTime()) return { ...state, status: "discarded" };
  if (event.kind === "yes") return { ...state, status: "confirmed" };
  if (event.kind === "no") return { ...state, status: "discarded" };
  return state;
}

export function holdExpiry(createdAt: Date, hours: number) {
  return new Date(createdAt.getTime() + hours * 3600_000).toISOString();
}

export function formatClock(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.max(1, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function splitMessage(text: string, max = 1600): string[] {
  const clean = (text ?? "").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    if (cut < max * 0.5) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    if (cut < max * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max - 1;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function numbered(parts: string[]) {
  return parts.length < 2 ? parts : parts.map((p, i) => `(${i + 1}/${parts.length}) ${p}`);
}

export function splitNumbered(text: string, max = 1600) {
  const first = splitMessage(text, max);
  if (first.length < 2) return first;
  return numbered(splitMessage(text, max - 10));
}

const EXAM = /\b(exam|examination|shows|vitals?|blood pressure|bp|heart rate|pulse|temp(?:erature)?|lungs?|heart|abdomen|tender|swelling|effusion|range of motion|reflexes|gait|rash|weight)\b/i;
const PLAN = /\b(plan|continue|start|stop|increase|decrease|refer|order|recheck|follow ?up|return|prescrib\w*|schedule|advise\w*|counsel\w*)\b/i;

export function isDictation(utts: Utterance[]) {
  return utts.length > 0 && utts.every((u) => u.source === "typed" && u.speaker === "clinician");
}

export function placeDictation(note: Note, template: Template, utts: Utterance[]): Note {
  const find = (...kinds: string[]) => template.sections.find((s) => kinds.includes(s.kind))?.key;
  const examKey = find("objective", "exam") ?? template.sections[0]?.key;
  const planKey = find("assessment_plan", "plan", "assessment") ?? template.sections.at(-1)?.key;
  const histKey = find("subjective", "hpi", "chief_complaint") ?? template.sections[0]?.key;
  const add: Record<string, NoteSentence[]> = {};
  for (const u of utts) {
    const key = (PLAN.test(u.text) ? planKey : EXAM.test(u.text) ? examKey : histKey) ?? "";
    const text = u.text.trim().replace(/^[a-z]/, (c) => c.toUpperCase());
    (add[key] ??= []).push({ id: `${key}_d${u.seq}`, text: /[.!?]$/.test(text) ? text : `${text}.`, evidence: [u.id], kind: "fact", support: "strong" });
  }
  return {
    ...note,
    sections: note.sections.map((s) => ({ ...s, sentences: [...(add[s.key] ?? []), ...s.sentences.filter((x) => x.kind === "system" || x.kind === "carried")] })),
  };
}
