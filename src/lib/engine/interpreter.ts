import type { Utterance } from "../types";
import { LATERALITY, NEGATION, numbersIn } from "./lang";
import { MEDICATIONS } from "./lexicon";

export interface InterpreterFlag {
  id: string;
  sourceId: string;
  renderedId: string;
  source: string;
  rendered: string;
  message: string;
}

export interface InterpreterCheck {
  interpreted: boolean;
  languages: string[];
  pairs: number;
  flags: InterpreterFlag[];
}

function medsIn(text: string) {
  return MEDICATIONS.filter((m) => m.patterns.some((re) => re.test(text))).map((m) => m.name);
}

function sameMultiset(a: number[], b: number[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function checkInterpretation(utterances: Utterance[]): InterpreterCheck {
  const utts = utterances.filter((u) => !u.redacted && (u.lang === "en" || u.lang === "es"));
  const languages = Array.from(new Set(utts.map((u) => u.lang!)));
  const flags: InterpreterFlag[] = [];
  let pairs = 0;
  let n = 0;
  const hasInterpreter = utts.some((u) => u.speaker === "other");
  for (let i = 0; i < utts.length - 1; i++) {
    const a = utts[i];
    const b = utts[i + 1];
    if (a.lang === b.lang || a.speaker === b.speaker) continue;
    if (hasInterpreter && (b.speaker !== "other" || a.speaker === "other")) continue;
    pairs++;
    if (!hasInterpreter) i++;
    const la = a.lang!;
    const lb = b.lang!;
    const issues: string[] = [];
    const na = numbersIn(a.text, la);
    const nb = numbersIn(b.text, lb);
    if ((na.length || nb.length) && !sameMultiset(na, nb)) issues.push(`numbers differ (${na.join(", ") || "none"} → ${nb.join(", ") || "none"})`);
    const negA = NEGATION[la].test(a.text);
    const negB = NEGATION[lb].test(b.text);
    if (negA !== negB) issues.push(negA ? "a negation was dropped in interpretation" : "a negation was added in interpretation");
    const ma = medsIn(a.text);
    const mb = medsIn(b.text);
    const missing = ma.filter((m) => !mb.includes(m));
    const extra = mb.filter((m) => !ma.includes(m));
    if (missing.length || extra.length) issues.push(`medication names differ (${[...missing, ...extra].join(", ")})`);
    const lat = (u: Utterance) => (LATERALITY[u.lang!].left.test(u.text) ? "left" : LATERALITY[u.lang!].right.test(u.text) ? "right" : null);
    const la2 = lat(a);
    const lb2 = lat(b);
    if (la2 && lb2 && la2 !== lb2) issues.push(`side differs (${la2} → ${lb2})`);
    if (issues.length) {
      flags.push({ id: `int_${++n}`, sourceId: a.id, renderedId: b.id, source: a.text, rendered: b.text, message: issues.join("; ") });
    }
  }
  return { interpreted: languages.length > 1 && pairs >= 2, languages, pairs, flags };
}
