import type { Chart, Note, NoteSentence, Utterance } from "../types";
import { MEDICATIONS } from "./lexicon";
import { ensurePeriod, overlap, sentenceCase, tokens, wordCount } from "./text";

export interface AssistResult {
  reply: string;
  note?: Note;
  citations: string[];
  action: "answer" | "edit" | "none";
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
    const add = /^(?:please )?add (?:that |a (?:line|note) (?:that )?)?(.+?) to (?:the )?([a-z&/ ]+?)(?: section)?\.?$/i.exec(msg);
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
