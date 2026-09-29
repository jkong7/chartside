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

export type ReviewIntent = { kind: "ready" } | { kind: "later" } | { kind: "repeat" } | { kind: "summary" } | { kind: "next" } | { kind: "other"; text: string };

export function reviewIntent(text: string): ReviewIntent {
  const t = norm(text);
  if (/\b(repeat|say that again|again please|come again|what was that)\b/.test(t)) return { kind: "repeat" };
  if (/\b(next patient|next visit|another patient|new patient|new visit|keep going)\b/.test(t)) return { kind: "next" };
  if (/\b(text|send|share|message)\b.*\b(patient|summary|her summary|his summary|their summary|visit summary)\b/.test(t)) return { kind: "summary" };
  if (/\b(sign|ready to sign|looks good|looks great|that's good|that's perfect|perfect|good to go|approve|ready)\b/.test(t) && !/\b(don't|not|change|but)\b/.test(t)) return { kind: "ready" };
  if (/^(no|nope|nothing|that's all|that's it|all set|done|bye|goodbye|thanks|thank you|later|text me|send it|send me the link)\b/.test(t) || /\b(text me|send me the link|i'll review later|review later|hang up)\b/.test(t)) return { kind: "later" };
  return { kind: "other", text: text.trim() };
}

export function directedAtScribe(text: string) {
  const t = norm(text);
  if (!t) return false;
  if (WAKE.test(t)) return true;
  if (reviewIntent(text).kind !== "other") return true;
  return /^(please |can you |could you |would you |go ahead and |i want you to |let's )?(text|send|make|change|add|remove|delete|drop|shorten|lengthen|expand|fix|update|rewrite|replace|include|put|move|mention|note that|document|code|switch|use|list|read|explain|what|what's|whats|why|how|did|does|is there|are there|which|who|when|tell me|show me|summarize)\b/.test(t);
}

function isQuestion(text: string) {
  return /\?\s*$/.test(text.trim()) || /^(is|are|do|does|can|could|would|will|may|shall|okay if|ok if|mind if|es|esta|puedo|le parece)\b/.test(norm(text));
}

export function consentGiven(text: string) {
  if (isQuestion(text)) return false;
  const t = norm(text);
  if (/\b(say they agreed|or press|when your patient)\b/.test(t)) return false;
  return /\b((she|he|they|patient|pt|the patient|mom|dad|parent|guardian|everyone|we both|both) (agreed|agrees|consented|consents|said yes|said ok|said okay|is okay with it|is fine with it|is ok with it)|consent (given|granted|obtained)|we have consent|got consent|go ahead and record|start recording|you can record|begin recording|dio su consentimiento|acepto|acepta|aceptaron)\b/.test(t);
}

export function consentRefused(text: string) {
  if (isQuestion(text)) return false;
  const t = norm(text);
  return /\b((she|he|they|patient|the patient|parent|guardian) (declined|declines|refused|refuses|said no|doesn't want|does not want|would rather not|isn't comfortable|is not comfortable)|no consent|consent (declined|refused)|don't record|do not record|no grabe|no quiere)\b/.test(t);
}

export function directAnswer(text: string): "yes" | "no" | null {
  if (isQuestion(text)) return null;
  if (negative(text)) return "no";
  if (affirmative(text)) return "yes";
  return null;
}

export function echoOf(text: string, spoken: string[], justSpoke = false) {
  const words = norm(text).split(" ").filter(Boolean);
  if (words.length < 2) return false;
  return spoken.some((line) => {
    const pool = new Set(norm(line).split(" "));
    const ratio = words.filter((w) => pool.has(w)).length / words.length;
    return (words.length >= 5 && ratio >= 0.75) || (justSpoke && ratio >= 0.7);
  });
}

export function bareWake(text: string) {
  const t = norm(text);
  return WAKE.test(t) && t.replace(WAKE, "").trim().length === 0;
}

export function chartQuestion(text: string) {
  const t = norm(text);
  return /^(please |can you |could you |would you )?(what|what's|whats|when|when's|who|who's|how many|how much|which|is there|are there|do i have|did|does|tell me|show me|list|read|summarize|find|look up)\b/.test(t);
}
