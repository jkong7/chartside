const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const WAKE = /\b(chart ?side|chart ?sides|charts ?ide|hart ?side)\b/;

export function affirmative(text: string) {
  const t = norm(text);
  if (!t || negative(text)) return false;
  return /\b(yes|yeah|yep|yup|sure|ok|okay|fine|agreed|agree|consent|consents|consented|go ahead|of course|absolutely|that's right|correct|it is|that's her|that's him|that's them|please do|no problem|s[ií]|claro|est[aá] bien|de acuerdo|vale|por supuesto|con gusto|adelante)\b/.test(t);
}

export function negative(text: string) {
  const t = norm(text);
  return /\b(no|nope|nah|not okay|not ok|don't|do not|declined|declines|decline|refused|refuses|rather not|i'd rather you didn't|not comfortable|wrong|prefiero que no|mejor no)\b/.test(t) && !/\bno problem\b/.test(t);
}

export type WakeCommand = "pause" | "resume" | "end" | null;

export function wakeCommand(text: string): WakeCommand {
  const t = norm(text);
  const m = WAKE.exec(t);
  if (!m) return null;
  const rest = t.slice(m.index + m[0].length);
  if (/\b(pause|hold|hold on|stop listening|mute)\b/.test(rest)) return "pause";
  if (/\b(resume|continue|unpause|start again|keep going|go on)\b/.test(rest)) return "resume";
  if (/\b(end|stop|done|finish|finished|wrap|that's it|end visit|end the visit|and visit|and the visit)\b/.test(rest)) return "end";
  return null;
}

export type ReviewIntent = { kind: "ready" } | { kind: "later" } | { kind: "repeat" } | { kind: "other"; text: string };

export function reviewIntent(text: string): ReviewIntent {
  const t = norm(text);
  if (/\b(repeat|say that again|again please|come again|what was that)\b/.test(t)) return { kind: "repeat" };
  if (/\b(sign|ready to sign|looks good|looks great|that's good|that's perfect|perfect|good to go|approve|ready)\b/.test(t) && !/\b(don't|not|change|but)\b/.test(t)) return { kind: "ready" };
  if (/^(no|nope|nothing|that's all|that's it|all set|done|bye|goodbye|thanks|thank you|later|text me|send it|send me the link)\b/.test(t) || /\b(text me|send me the link|i'll review later|review later|hang up)\b/.test(t)) return { kind: "later" };
  return { kind: "other", text: text.trim() };
}

export function directedAtScribe(text: string) {
  const t = norm(text);
  if (!t) return false;
  if (WAKE.test(t)) return true;
  if (reviewIntent(text).kind !== "other") return true;
  return /^(please |can you |could you |would you |go ahead and |i want you to |let's )?(make|change|add|remove|delete|drop|shorten|lengthen|expand|fix|update|rewrite|replace|include|put|move|mention|note that|document|code|switch|use|list|read|explain|what|what's|whats|why|how|did|does|is there|are there|which|who|when|tell me|show me|summarize)\b/.test(t);
}
