const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const WAKE = /\b(chart ?side|chart ?sides|charts ?ide|hart ?side)\b/;

export function affirmative(text: string) {
  const t = norm(text);
  if (!t || negative(text)) return false;
  return /\b(yes|yeah|yep|yup|sure|ok|okay|fine|agreed|agree|consent|consents|consented|go ahead|of course|absolutely|that's right|correct|it is|that's her|that's him|that's them|please do|no problem)\b/.test(t);
}

export function negative(text: string) {
  const t = norm(text);
  return /\b(no|nope|nah|not okay|not ok|don't|do not|declined|declines|decline|refused|refuses|rather not|i'd rather you didn't|not comfortable|wrong)\b/.test(t) && !/\bno problem\b/.test(t);
}

export type WakeCommand = "pause" | "resume" | "end" | null;

export function wakeCommand(text: string): WakeCommand {
  const t = norm(text);
  const m = WAKE.exec(t);
  if (!m) return null;
  const rest = t.slice(m.index + m[0].length);
  if (/\b(pause|hold|hold on|stop listening|mute)\b/.test(rest)) return "pause";
  if (/\b(resume|continue|unpause|start again|keep going|go on)\b/.test(rest)) return "resume";
  if (/\b(end|stop|done|finish|finished|wrap|that's it|end visit|end the visit)\b/.test(rest)) return "end";
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
