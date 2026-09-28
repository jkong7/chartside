import type { Chart, Note, NoteSentence, Utterance } from "../types";
import { GUIDELINE_QUESTION, searchEvidence } from "./evidence";
import { MEDICATIONS } from "./lexicon";
import { ensurePeriod, overlap, sentenceCase, tokens, wordCount } from "./text";

export interface AssistResult {
  reply: string;
  note?: Note;
  citations: string[];
  action: "answer" | "edit" | "none";
  rule?: { kind: "format" | "abbreviate" | "max_words"; section: string; value: string; label: string };
  sources?: { title: string; org: string; year: number; url: string }[];
}

const EXPAND: [RegExp, string][] = [
  [/\bHTN\b/g, "hypertension"],
  [/\bT2DM\b/g, "type 2 diabetes"],
  [/\bHLD\b/g, "hyperlipidemia"],
  [/\bSOB\b/g, "shortness of breath"],
  [/\bf\/u\b/gi, "follow-up"],
  [/\bBID\b/g, "twice daily"],
  [/\bTID\b/g, "three times daily"],
  [/\bQD\b/g, "daily"],
  [/\bPRN\b/g, "as needed"],
  [/\bNKDA\b/g, "no known drug allergies"],
  [/\bURI\b/g, "upper respiratory infection"],
  [/\bGAD\b/g, "generalized anxiety disorder"],
  [/\bc\/o\b/gi, "complains of"],
  [/\bh\/o\b/gi, "history of"],
];

const ABBREV: [RegExp, string][] = [
  [/\bessential hypertension\b/gi, "HTN"],
  [/\bhypertension\b/gi, "HTN"],
  [/\btype 2 diabetes(?: mellitus)?\b/gi, "T2DM"],
  [/\bhyperlipidemia\b/gi, "HLD"],
  [/\bshortness of breath\b/gi, "SOB"],
  [/\btwice daily\b/gi, "BID"],
  [/\bthree times daily\b/gi, "TID"],
  [/\bas needed\b/gi, "PRN"],
  [/\bno known drug allergies\b/gi, "NKDA"],
];

function rewriteAll(note: Note, subs: [RegExp, string][]) {
  let n = 0;
  const sections = note.sections.map((s) => ({
    ...s,
    sentences: s.sentences.map((x) => {
      let t = x.text;
      for (const [re, to] of subs) t = t.replace(re, to);
      if (t === x.text) return x;
      n++;
      return { ...x, text: t, edited: true };
    }),
  }));
  return { note: { ...note, sections }, n };
}

function findSection(note: Note, name: string) {
  const n = name.toLowerCase().trim().replace(/^the /, "").replace(/ section$/, "");
  const alias: Record<string, string[]> = {
    hpi: ["hpi", "history", "history of present illness", "subjective", "interval history"],
    plan: ["plan", "a&p", "a/p", "assessment and plan", "assessment & plan", "assessment", "ap"],
    exam: ["exam", "physical exam", "objective", "pe"],
    meds: ["meds", "medications", "medication list"],
  };
  const direct = note.sections.find((s) => s.title.toLowerCase() === n || s.key === n);
  if (direct) return direct;
  for (const [, names] of Object.entries(alias)) {
    if (names.includes(n)) {
      const hit = note.sections.find((s) => names.some((a) => s.title.toLowerCase().includes(a) || s.key === a || s.key.includes(a.replace(/[^a-z]/g, ""))));
      if (hit) return hit;
    }
  }
  return note.sections.find((s) => s.title.toLowerCase().includes(n));
}

function updateSection(note: Note, key: string, fn: (s: NoteSentence[]) => NoteSentence[]): Note {
  return { ...note, sections: note.sections.map((s) => (s.key === key ? { ...s, sentences: fn(s.sentences) } : s)) };
}

export function localAssist(message: string, note: Note | null, utterances: Utterance[], chart?: Chart): AssistResult {
  const msg = message.trim();

  if (note) {
    const always = /^(?:always|from now on|going forward)[,:]?\s+/i.test(msg);
    const body = msg.replace(/^(?:always|from now on|going forward)[,:]?\s+/i, "");
    const fmt = /^(?:use|write|make|put|format)\s+(?:the\s+)?(?:(.+?)\s+(?:as|in|into)\s+(?:a\s+)?(bullets?|bullet points|a list|paragraphs?|prose)|(bullets?|bullet points|paragraphs?|prose)\s+(?:for|in)\s+(?:the\s+)?(.+?))(?:\s+section)?\.?$/i.exec(body);
    if (fmt) {
      const secName = fmt[1] ?? fmt[4];
      const kind = /bullet|list/i.test(fmt[2] ?? fmt[3]) ? "bullets" : "paragraph";
      const sec = findSection(note, secName);
      if (!sec) return { reply: `I couldn't find a section called "${secName}".`, citations: [], action: "none" };
      const next = { ...note, sections: note.sections.map((s) => (s.key === sec.key ? { ...s, format: kind as "bullets" | "paragraph" } : s)) };
      return {
        reply: `${sec.title} now uses ${kind === "bullets" ? "bullet points" : "a paragraph"}.${always ? " I'll do this in future notes too; you can change it in Settings → Style rules." : ""}`,
        note: next,
        citations: [],
        action: "edit",
        rule: always ? { kind: "format", section: sec.key, value: kind, label: `Write ${sec.title} as ${kind === "bullets" ? "bullet points" : "a paragraph"}` } : undefined,
      };
    }
    if (/^(?:expand|spell out|no|don't use|avoid)\s+(?:the\s+|all\s+)?abbreviations?\.?$/i.test(body)) {
      const r = rewriteAll(note, EXPAND);
      return { reply: r.n ? `Spelled out abbreviations in ${r.n} line${r.n > 1 ? "s" : ""}.` : "There were no abbreviations to spell out.", note: r.n ? r.note : undefined, citations: [], action: r.n ? "edit" : "none" };
    }
    if (/^(?:use|abbreviate|add)\s+(?:standard\s+|common\s+|clinical\s+)?abbreviations?\.?$/i.test(body)) {
      const r = rewriteAll(note, ABBREV);
      return {
        reply: `Abbreviated ${r.n} line${r.n === 1 ? "" : "s"}.${always ? " Future notes will use standard abbreviations too." : ""}`,
        note: r.n ? r.note : undefined,
        citations: [],
        action: r.n ? "edit" : "none",
        rule: always ? { kind: "abbreviate", section: "*", value: "standard", label: "Use standard clinical abbreviations (HTN, T2DM, BID, PRN…)" } : undefined,
      };
    }
    const cap = /^(?:keep|limit)\s+(?:the\s+)?(.+?)\s+(?:under|to|below|at most)\s+(\d{2,3})\s+words\.?$/i.exec(body);
    if (cap) {
      const sec = findSection(note, cap[1]);
      if (!sec) return { reply: `I couldn't find a section called "${cap[1]}".`, citations: [], action: "none" };
      const limit = Number(cap[2]);
      let words = 0;
      const kept = sec.sentences.filter((s, i) => {
        if (s.pending || s.heading) return true;
        const wc = wordCount(s.text);
        if (i === 0 || words + wc <= limit) {
          words += wc;
          return true;
        }
        return false;
      });
      return {
        reply: `${sec.title} is now ${words} words.${always ? ` Future ${sec.title} sections will stay under ${limit} words.` : ""}`,
        note: updateSection(note, sec.key, () => kept),
        citations: [],
        action: "edit",
        rule: always ? { kind: "max_words", section: sec.key, value: String(limit), label: `Keep ${sec.title} under ${limit} words` } : undefined,
      };
    }
    const add =/^(?:please )?add (?:that |a (?:line|note) (?:that )?)?(.+?) to (?:the )?([a-z&/ ]+?)(?: section)?\.?$/i.exec(msg);
    if (add) {
      const sec = findSection(note, add[2]);
      if (!sec) return { reply: `I couldn't find a section called "${add[2]}".`, citations: [], action: "none" };
      const text = ensurePeriod(sentenceCase(add[1]));
      const next = updateSection(note, sec.key, (xs) => [...xs, { id: `${sec.key}_a${Date.now()}`, text, evidence: [], kind: "clinician", support: "strong", edited: true }]);
      return { reply: `Added to ${sec.title}: "${text}"`, note: next, citations: [], action: "edit" };
    }
    const shorten = /^(?:make|keep)?\s*(?:the )?([a-z&/ ]+?) (?:more )?(?:shorter|concise|brief|tighter)|^(?:shorten|condense|tighten) (?:the )?([a-z&/ ]+)$/i.exec(msg);
    if (shorten) {
      const sec = findSection(note, shorten[1] ?? shorten[2]);
      if (!sec) return { reply: "Which section should I shorten?", citations: [], action: "none" };
      const before = sec.sentences.filter((s) => !s.pending).reduce((n, s) => n + wordCount(s.text), 0);
      const keep = sec.sentences.filter((s, i) => s.heading || s.pending || i === 0 || /denies|deny|rated|not at goal|allerg|start|increase|change|discontinue|order|refer|follow up|return/i.test(s.text));
      const next = updateSection(note, sec.key, () => keep);
      const after = keep.filter((s) => !s.pending).reduce((n, s) => n + wordCount(s.text), 0);
      return { reply: `Shortened ${sec.title} from ${before} to ${after} words, keeping key findings, negatives, and actions.`, note: next, citations: [], action: "edit" };
    }
    const remove = /^(?:remove|delete|drop) (?:the )?(?:line|sentence)?\s*(?:about|mentioning|with)?\s*["“]?(.+?)["”]?(?: from (?:the )?([a-z&/ ]+))?\.?$/i.exec(msg);
    if (remove) {
      const needle = remove[1].toLowerCase();
      let removed = 0;
      const sections = note.sections.map((s) => {
        if (remove[2] && findSection(note, remove[2])?.key !== s.key) return s;
        const kept = s.sentences.filter((x) => {
          const hit = x.text.toLowerCase().includes(needle);
          if (hit) removed++;
          return !hit;
        });
        return { ...s, sentences: kept };
      });
      if (!removed) return { reply: `No lines mention "${remove[1]}".`, citations: [], action: "none" };
      return { reply: `Removed ${removed} line${removed > 1 ? "s" : ""} mentioning "${remove[1]}".`, note: { ...note, sections }, citations: [], action: "edit" };
    }
    if (/^(?:insert|accept|add) (?:the )?normal (?:exam|findings)/i.test(msg)) {
      let n = 0;
      const sections = note.sections.map((s) => ({ ...s, sentences: s.sentences.map((x) => (x.pending ? (n++, { ...x, pending: false, kind: "clinician" as const, support: "strong" as const }) : x)) }));
      return { reply: n ? `Accepted ${n} templated normal exam finding${n > 1 ? "s" : ""}. They're marked as clinician-attested.` : "There are no pending normal findings.", note: { ...note, sections }, citations: [], action: n ? "edit" : "none" };
    }
  }

  if (GUIDELINE_QUESTION.test(msg) && !/\b(?:say|said|tell|told|mention(?:ed)?|ask(?:ed)?)\b/i.test(msg)) {
    const hits = searchEvidence(msg);
    if (hits.length) {
      return {
        reply: hits.map((h, i) => `[${i + 1}] ${h.entry.title}: ${h.entry.text}`).join("\n\n"),
        citations: [],
        sources: hits.map((h) => ({ title: h.entry.title, org: h.entry.org, year: h.entry.year, url: h.entry.url })),
        action: "answer",
      };
    }
  }

  const q = tokens(msg);
  const scored = utterances
    .filter((u) => !u.redacted)
    .map((u) => ({ u, score: overlap(msg, u.text) + q.filter((t) => u.text.toLowerCase().includes(t)).length * 0.05 }))
    .filter((x) => x.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.u.seq - b.u.seq);

  const chartBits: string[] = [];
  if (chart) {
    if (/\b(med|medication|taking|prescri|dose)/i.test(msg) || MEDICATIONS.some((m) => m.patterns.some((re) => re.test(msg)))) chartBits.push(`On file: ${chart.medications.map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" ")).join("; ") || "no medications"}.`);
    if (/\ballerg/i.test(msg)) chartBits.push(`Allergies on file: ${chart.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join(", ") || "none recorded"}.`);
    if (/\b(lab|a1c|result|ldl|egfr|kidney|cholesterol)/i.test(msg)) chartBits.push(`Recent labs: ${(chart.labs ?? []).map((l) => `${l.name} ${l.value} (${l.date})`).join("; ") || "none"}.`);
    if (/\b(last visit|previous|prior|last time)/i.test(msg)) {
      const pv = chart.priorVisits?.[0];
      if (pv) chartBits.push(`Last visit ${pv.date}: ${pv.summary} Plan: ${pv.plan.join("; ")}.`);
    }
  }
  if (!scored.length && !chartBits.length) {
    return { reply: "I couldn't find that in the transcript or chart. Try asking about a symptom, medication, lab, or the last visit. I can also edit the note: \"add … to plan\", \"make HPI shorter\", \"remove … \", or \"insert normal exam\".", citations: [], action: "none" };
  }
  const parts = [];
  if (scored.length) parts.push(`From the visit: ${scored.map((x) => `“${x.u.text}” (${x.u.speaker})`).join(" ")}`);
  parts.push(...chartBits);
  return { reply: parts.join("\n\n"), citations: scored.map((x) => x.u.id), action: "answer" };
}
