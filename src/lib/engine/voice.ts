export type VoiceOp =
  | { type: "text"; text: string }
  | { type: "newline" }
  | { type: "paragraph" }
  | { type: "delete_last" }
  | { type: "clear_section" }
  | { type: "goto"; target: string }
  | { type: "next_section" }
  | { type: "previous_section" }
  | { type: "snippet"; name: string }
  | { type: "bullet" }
  | { type: "stop" }
  | { type: "help" }
  | { type: "save" };

export const VOICE_HELP: { say: string; does: string }[] = [
  { say: "period · comma · question mark · colon", does: "Punctuation" },
  { say: "new line · new paragraph", does: "Line breaks" },
  { say: "bullet", does: "Start an indented plan item" },
  { say: "scratch that · delete last sentence", does: "Remove what you just said" },
  { say: "clear section", does: "Empty the section you're in" },
  { say: "go to plan · go to HPI · next section · previous section", does: "Move between sections" },
  { say: "insert normal exam · insert return precautions", does: "Insert a snippet by name" },
  { say: "save section", does: "Save and keep dictating" },
  { say: "stop dictation", does: "Turn the mic off" },
  { say: "what can I say", does: "Show this list" },
];

const SECTION_WORDS: Record<string, string[]> = {
  hpi: ["hpi", "history of present illness", "history"],
  subjective: ["subjective"],
  ros: ["ros", "review of systems"],
  exam: ["exam", "physical exam", "physical"],
  objective: ["objective"],
  assessment: ["assessment"],
  plan: ["plan"],
  assessment_plan: ["assessment and plan", "a and p", "a&p", "a & p"],
  medications: ["medications", "meds"],
  allergies: ["allergies"],
  chief_complaint: ["chief complaint", "cc"],
  results: ["results", "labs", "data"],
  patient_instructions: ["patient instructions", "instructions"],
  follow_up: ["follow up", "follow-up"],
  mental_status: ["mental status", "mse"],
  social: ["social history", "social"],
  family: ["family history"],
  pmh: ["past medical history", "pmh"],
};

export function sectionTarget(spoken: string, sections: { key: string; title: string; kind?: string }[]) {
  const s = spoken.toLowerCase().replace(/[.,!?]/g, "").replace(/^(the|my)\s+/, "").trim();
  const byTitle = sections.find((x) => x.title.toLowerCase() === s || x.key.toLowerCase() === s);
  if (byTitle) return byTitle.key;
  for (const [kind, words] of Object.entries(SECTION_WORDS)) {
    if (!words.includes(s)) continue;
    const hit = sections.find((x) => x.kind === kind || x.key === kind) ?? sections.find((x) => x.key.includes(kind) || kind.includes(x.key));
    if (hit) return hit.key;
    if (kind === "plan" || kind === "assessment") {
      const ap = sections.find((x) => /assessment|plan|ap/.test(x.key));
      if (ap) return ap.key;
    }
  }
  const loose = sections.find((x) => x.title.toLowerCase().includes(s) || s.includes(x.title.toLowerCase()));
  return loose?.key ?? null;
}

const clean = (t: string) => t.toLowerCase().replace(/[.,!?;:]+/g, "").replace(/\s+/g, " ").trim();

export function parseUtterance(raw: string): VoiceOp[] {
  const c = clean(raw);
  if (!c) return [];
  if (/^(stop|end|pause) (dictation|dictating|listening)$|^(mic|microphone) off$/.test(c)) return [{ type: "stop" }];
  if (/^what can i say$|^(show )?(voice )?commands$|^help$/.test(c)) return [{ type: "help" }];
  if (/^(scratch that|delete (the )?last sentence|delete that|undo that|strike that)$/.test(c)) return [{ type: "delete_last" }];
  if (/^(clear|erase) (this |the )?section$/.test(c)) return [{ type: "clear_section" }];
  if (/^(next|following) section$/.test(c)) return [{ type: "next_section" }];
  if (/^(previous|last|prior) section$/.test(c)) return [{ type: "previous_section" }];
  if (/^save( (the )?section| that| note)?$/.test(c)) return [{ type: "save" }];
  const go = /^(?:go to|jump to|move to|switch to) (?:the )?(.+?)(?: section)?$/.exec(c);
  if (go) return [{ type: "goto", target: go[1] }];
  const ins = /^(?:insert|add|paste) (?:my |the |a )?(.+?)(?: snippet| phrase| template)?$/.exec(c);
  if (ins && !/\b(to|into|in) (the )?(plan|note|hpi|exam)\b/.test(ins[1])) return [{ type: "snippet", name: ins[1] }];
  return inlineOps(raw);
}

const PUNCT: [RegExp, string][] = [
  [/\s*\b(?:period|full stop)\b[.,]?/gi, "."],
  [/\s*\bcomma\b[.,]?/gi, ","],
  [/\s*\bquestion mark\b[.,]?/gi, "?"],
  [/\s*\bexclamation (?:point|mark)\b[.,]?/gi, "!"],
  [/\s*\bsemicolon\b[.,]?/gi, ";"],
  [/\s*\bcolon\b[.,]?/gi, ":"],
  [/\s*\bopen paren(?:thesis)?\b[.,]?\s*/gi, " ("],
  [/\s*\bclose paren(?:thesis)?\b[.,]?/gi, ")"],
  [/\s*\bslash\b\s*/gi, "/"],
];

function punctuate(t: string) {
  let s = t;
  for (const [re, sub] of PUNCT) s = s.replace(re, sub);
  return s.replace(/([.,?!;:])\1+/g, "$1").replace(/([.?!])[.,]/g, "$1").replace(/\s+([.,?!;:)])/g, "$1").trim();
}

function inlineOps(raw: string): VoiceOp[] {
  const out: VoiceOp[] = [];
  const parts = raw.split(/\s*\b(new paragraph|new line|next line|bullet point|bullet)\b[.,]?\s*/i);
  for (const p of parts) {
    if (!p) continue;
    const l = p.toLowerCase();
    if (l === "new paragraph") out.push({ type: "paragraph" });
    else if (l === "new line" || l === "next line") out.push({ type: "newline" });
    else if (l === "bullet" || l === "bullet point") out.push({ type: "bullet" });
    else {
      const t = punctuate(p);
      if (t && !/^[.,?!;:]+$/.test(t)) out.push({ type: "text", text: t });
      else if (t) out.push({ type: "text", text: t });
    }
  }
  return out;
}

export interface DictationState {
  value: string;
  history: string[];
}

function needsCap(before: string) {
  const t = before.replace(/\s+$/, "");
  return !t || /[.?!]$/.test(t) || /\n$/.test(before) || /^-\s*$/.test(t.split("\n").pop() ?? "");
}

export function applyText(state: DictationState, text: string, replacements: { from: string; to: string }[] = []): DictationState {
  let t = text;
  for (const r of replacements) t = t.replace(new RegExp(`\\b${r.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), r.to);
  const v = state.value;
  const attach = /^[.,?!;:)]/.test(t);
  if (needsCap(v) && !attach) t = t.charAt(0).toUpperCase() + t.slice(1);
  const sep = !v || /[\s(\n]$/.test(v) || attach ? "" : " ";
  return { value: v + sep + t, history: [...state.history, v] };
}

export function applyOps(state: DictationState, ops: VoiceOp[], replacements: { from: string; to: string }[] = []): DictationState {
  let s = state;
  for (const op of ops) {
    if (op.type === "text") s = applyText(s, op.text, replacements);
    else if (op.type === "newline") s = { value: s.value.replace(/[ \t]+$/, "") + "\n", history: [...s.history, s.value] };
    else if (op.type === "paragraph") s = { value: s.value.replace(/\s+$/, "") + "\n\n", history: [...s.history, s.value] };
    else if (op.type === "bullet") s = { value: s.value.replace(/[ \t]+$/, "") + (s.value && !s.value.endsWith("\n") ? "\n" : "") + "- ", history: [...s.history, s.value] };
    else if (op.type === "delete_last") s = { value: s.history.at(-1) ?? "", history: s.history.slice(0, -1) };
    else if (op.type === "clear_section") s = { value: "", history: [...s.history, s.value] };
  }
  return s;
}
