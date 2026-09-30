import type { Note } from "../types";
import type { RuleCandidate } from "./style";
import { wordCount } from "./text";

export type Detail = "concise" | "standard" | "detailed";

type Slot = "subjective" | "objective" | "assessment" | "plan" | "assessment_plan" | "data" | "behavior" | "intervention" | "response";

const HEADINGS: [RegExp, Slot][] = [
  [/^(?:a\s*\/\s*p|a\s*&\s*p|assessment\s*(?:and|&|\/)\s*plan|impression\s*(?:and|&|\/)\s*plan|ap)$/i, "assessment_plan"],
  [/^(?:s|subj(?:ective)?|hpi|history(?: of present illness)?|cc\s*\/\s*hpi|chief complaint|interval history)$/i, "subjective"],
  [/^(?:o|obj(?:ective)?|exam|physical exam(?:ination)?|pe|vitals|findings)$/i, "objective"],
  [/^(?:a|assessment|impression|dx|diagnos[ie]s)$/i, "assessment"],
  [/^(?:p|plan|recommendations?|treatment plan)$/i, "plan"],
  [/^(?:d|data)$/i, "data"],
  [/^(?:b|behaviou?r)$/i, "behavior"],
  [/^(?:i|interventions?)$/i, "intervention"],
  [/^(?:r|response)$/i, "response"],
];

const SLOT_KEYS: Record<Slot, RegExp> = {
  subjective: /^(?:subjective|hpi|history|s)$/i,
  objective: /^(?:objective|exam|o)$/i,
  assessment: /^(?:assessment|a)$/i,
  plan: /^(?:plan|p)$/i,
  assessment_plan: /^(?:assessment_plan|ap|a_p)$/i,
  data: /^(?:data|d)$/i,
  behavior: /^(?:behavior|behaviour|b)$/i,
  intervention: /^(?:intervention|interventions|i)$/i,
  response: /^(?:response|r)$/i,
};

const ABBREVS = [/\bHTN\b/, /\bT2DM\b|\bDM2?\b/, /\bBID\b/, /\bTID\b/, /\bPRN\b/, /\bf\/u\b/i, /\bSOB\b/, /\bNKDA\b/, /\bpt\b/i, /\bc\/o\b/i, /\bw\/o?\b/i, /\bHLD\b/, /\bURI\b/, /\bRTC\b/, /\bhx\b/i, /\bdx\b/i];

export interface SampleSection {
  slot: Slot;
  heading: string;
  lines: string[];
}

export interface StyleMatch {
  rules: RuleCandidate[];
  detail: Detail;
  findings: string[];
  sections: SampleSection[];
}

function headingOf(line: string): { heading: string; rest: string } | null {
  const t = line.trim().replace(/^#+\s*/, "").replace(/^\*\*(.+?)\*\*/, "$1");
  const m = /^([A-Za-z][A-Za-z &/]{0,40}?)\s*[:\-–]\s*(.*)$/.exec(t);
  if (m && HEADINGS.some(([re]) => re.test(m[1].trim()))) return { heading: m[1].trim(), rest: m[2].trim() };
  const bare = t.replace(/[:.]$/, "").trim();
  if (bare.length <= 40 && HEADINGS.some(([re]) => re.test(bare)) && (/[:]$/.test(t) || bare === bare.toUpperCase())) return { heading: bare, rest: "" };
  return null;
}

export function splitSample(sample: string): SampleSection[] {
  const out: SampleSection[] = [];
  let cur: SampleSection | null = null;
  for (const raw of sample.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const h = headingOf(line);
    if (h) {
      const slot = HEADINGS.find(([re]) => re.test(h.heading))![1];
      cur = { slot, heading: h.heading, lines: h.rest ? [h.rest] : [] };
      out.push(cur);
    } else if (cur) cur.lines.push(line.trim());
  }
  return out;
}

const bulleted = (l: string) => /^(?:[-*•·]|\d+[.)]|[a-z][.)])\s+/.test(l);

function sectionKeyFor(slot: Slot, keys: string[]) {
  const direct = keys.find((k) => SLOT_KEYS[slot].test(k));
  if (direct) return direct;
  if (slot === "assessment" || slot === "plan") return keys.find((k) => SLOT_KEYS.assessment_plan.test(k)) ?? null;
  if (slot === "assessment_plan") return keys.find((k) => SLOT_KEYS.assessment.test(k)) ?? null;
  return null;
}

function pronounStyle(text: string) {
  const pt = (text.match(/\bpt\.?\b/gi) ?? []).length;
  const client = (text.match(/\bclient\b/gi) ?? []).length;
  const patient = (text.match(/\bpatient\b/gi) ?? []).length;
  if (client > patient && client >= pt && client >= 1) return "client";
  if (pt > patient && pt >= 2) return "Pt";
  return null;
}

export function detailFromWords(words: number): Detail {
  return words < 110 ? "concise" : words > 320 ? "detailed" : "standard";
}

export function matchStyle(sample: string, note: Pick<Note, "sections">): StyleMatch {
  const sections = splitSample(sample);
  const keys = note.sections.map((s) => s.key);
  const titles = new Map(note.sections.map((s) => [s.key, s.title]));
  const rules: RuleCandidate[] = [];
  const findings: string[] = [];
  const text = sections.flatMap((s) => s.lines).join("\n") || sample;
  const words = wordCount(text);
  const detail = detailFromWords(words);

  const mapped: { key: string; sec: SampleSection[] }[] = [];
  for (const s of sections) {
    const key = sectionKeyFor(s.slot, keys);
    if (!key) continue;
    const hit = mapped.find((m) => m.key === key);
    if (hit) hit.sec.push(s);
    else mapped.push({ key, sec: [s] });
  }

  const order = mapped.map((m) => m.key);
  const current = keys.filter((k) => order.includes(k));
  if (order.length >= 2 && order.join(",") !== current.join(",")) {
    const names = order.map((k) => mapped.find((m) => m.key === k)!.sec.map((s) => s.heading).join("/"));
    rules.push({ kind: "order", section: "*", value: order.join(","), label: `Put sections in your order: ${names.join(", ")}` });
    findings.push(`Section order: ${names.join(", ")}`);
  }

  for (const m of mapped) {
    const heading = m.sec.length > 1 ? m.sec.map((s) => s.heading).join("/") : m.sec[0].heading;
    const title = titles.get(m.key) ?? m.key;
    if (heading && heading.toLowerCase() !== title.toLowerCase()) {
      rules.push({ kind: "heading", section: m.key, value: heading, label: `Call ${title} "${heading}"` });
    }
    const lines = m.sec.flatMap((s) => s.lines);
    if (!lines.length) continue;
    const bullets = lines.filter(bulleted).length;
    const fmt = bullets >= Math.max(2, Math.ceil(lines.length * 0.6)) ? "bullets" : bullets === 0 && lines.length <= 3 ? "paragraph" : null;
    const have = note.sections.find((s) => s.key === m.key)?.format;
    if (fmt && fmt !== have) rules.push({ kind: "format", section: m.key, value: fmt, label: `Write ${heading} as ${fmt === "bullets" ? "a bulleted list" : "a paragraph"}` });
    const sampleWords = wordCount(lines.join(" "));
    const noteWords = wordCount((note.sections.find((s) => s.key === m.key)?.sentences ?? []).filter((s) => !s.pending && !s.heading).map((s) => s.text).join(" "));
    if (noteWords >= 40 && sampleWords > 0 && sampleWords < noteWords * 0.6) {
      const cap = Math.max(25, Math.round((sampleWords * 1.3) / 5) * 5);
      rules.push({ kind: "max_words", section: m.key, value: String(cap), label: `Keep ${heading} under ${cap} words` });
    }
  }
  const headed = rules.filter((r) => r.kind === "heading");
  if (headed.length) findings.push(`Headings: ${headed.map((r) => r.value).join(", ")}`);
  const fmts = rules.filter((r) => r.kind === "format");
  if (fmts.length) findings.push(fmts.map((r) => r.label).join("; "));

  const abbrev = ABBREVS.filter((re) => re.test(text)).length;
  if (abbrev >= 2) {
    rules.push({ kind: "abbreviate", section: "*", value: "standard", label: "Use standard clinical abbreviations (HTN, T2DM, BID, PRN…)" });
    findings.push("Uses standard abbreviations");
  }
  const pro = pronounStyle(text);
  if (pro) {
    rules.push({ kind: "pronoun", section: "*", value: pro, label: pro === "client" ? 'Say "client" instead of "patient"' : 'Write "Pt" instead of "the patient"' });
    findings.push(pro === "client" ? 'Says "client"' : 'Writes "Pt"');
  }
  findings.push(`Length: ${detail === "concise" ? "brief" : detail} (${words} words)`);
  return { rules, detail, findings, sections };
}

const PHI = [/\b\d{3}-\d{2}-\d{4}\b/, /\b(?:DOB|D\.O\.B\.|date of birth|MRN|medical record (?:number|no))\b\s*[:#]?\s*\S/i, /\b\d{1,2}\/\d{1,2}\/(?:19|20)\d{2}\b/, /\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/, /\b(?:Mr|Mrs|Ms|Miss)\.?\s+[A-Z][a-z]+/];

export function samplePhiProblem(sample: string) {
  if (PHI[0].test(sample)) return "Take out the Social Security number first.";
  if (PHI[1].test(sample) || PHI[2].test(sample)) return "Take out dates of birth, visit dates and record numbers first.";
  if (PHI[3].test(sample)) return "Take out phone numbers first.";
  if (PHI[4].test(sample)) return "Take out the patient's name first.";
  return null;
}
