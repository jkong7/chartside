import type { NoteSentence, Utterance } from "../types";

const REEVAL = /\b(?:re-?evaluat\w*|re-?assess\w*|recheck\w*|re-?exam\w*|repeat (?:ecg|ekg|troponin|vitals|exam)|after (?:the )?(?:fluids|medication|meds|treatment|nebulizer|breathing treatment|zofran|ondansetron|toradol|ketorolac|morphine|dilaudid)|(?:feels|feeling|looks|looking) (?:much )?(?:better|worse|improved)|pain (?:is )?(?:now|down to)|(?:troponin|ecg|ekg|ct|x-?ray|labs?) (?:is|are|came back|shows?|showed))\b/i;
const DISPO: [RegExp, string][] = [
  [/\bobservation\b|\bobs unit\b|\bobserve (?:you|her|him) overnight\b/i, "Observation"],
  [/\b(?:admit|admission|admitting)\b[^.]*\b(?:to|for)\b/i, "Admit"],
  [/\btransfer(?:ring)?\b[^.]*\b(?:to|for)\b/i, "Transfer"],
  [/\b(?:discharge(?:d)?|go(?:ing)? home|send you home|safe (?:to go|for discharge))\b/i, "Discharge home"],
  [/\bleft without being seen|\bagainst medical advice|\bAMA\b/i, "Left against medical advice"],
];
const CRIT = /\bcritical care time\b[^\d]{0,20}(\d{2,3})\s*minutes?/i;

export function edCourse(utts: Utterance[], startedAt: string | null, key: string): NoteSentence[] {
  const base = startedAt ? new Date(startedAt).getTime() : null;
  const out: NoteSentence[] = [];
  for (const u of utts) {
    if (u.speaker !== "clinician" || !REEVAL.test(u.text)) continue;
    const t = base !== null ? new Date(base + u.tStart * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : null;
    const text = u.text.trim().replace(/^(?:okay|so|alright),?\s+/i, "").replace(/^re-?evaluat\w*(?: (?:now|you now))?,?\s*/i, "").replace(/\byou('re| are)\b/gi, "patient is").replace(/\byour\b/gi, "the").replace(/\byou\b/gi, "patient");
    const label = /\b(?:first|initial)\b/i.test(text) && !/\b(?:repeat|after|re-?evaluat|feels|feeling)\b/i.test(text) ? "Initial results" : /^(?:the )?(?:repeat )?(?:troponin|ecg|ekg|ct|x-?ray|chest x-?ray|labs?)\b/i.test(text) ? "Results" : "Re-evaluation";
    out.push({ id: `${key}_${out.length + 1}`, text: `${t ? `${t} ` : ""}${label}: ${text.charAt(0).toUpperCase()}${text.slice(1).replace(/[.]?$/, ".")}`, evidence: [u.id], kind: "fact", support: "strong" });
  }
  if (!out.length) out.push({ id: `${key}_1`, text: "No re-evaluation documented. ***", evidence: [], kind: "system", support: "strong" });
  return out;
}

export function edDisposition(utts: Utterance[], key: string): NoteSentence[] {
  for (const u of [...utts].reverse()) {
    if (u.speaker !== "clinician") continue;
    const d = DISPO.find(([re]) => re.test(u.text));
    if (d) return [{ id: `${key}_1`, text: `Disposition: ${d[1]}.`, evidence: [u.id], kind: "fact", support: "strong" }];
  }
  return [{ id: `${key}_1`, text: "Disposition: ***", evidence: [], kind: "system", support: "strong" }];
}

export function criticalCareMinutes(utts: Utterance[]) {
  for (const u of utts) {
    const m = CRIT.exec(u.text);
    if (m) return Number(m[1]);
  }
  return 0;
}

export function edDispositionOf(utts: Utterance[]) {
  const s = edDisposition(utts, "x")[0].text;
  return /\*\*\*/.test(s) ? null : s.replace(/^Disposition: |\.$/g, "");
}
