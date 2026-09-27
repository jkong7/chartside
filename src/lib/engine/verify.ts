import type { Chart, Note, NoteSentence, OmissionFlag, Template, Utterance } from "../types";
import type { Facts } from "./extract";
import { SYMPTOMS } from "./lexicon";
import { overlap } from "./text";

const RED_FLAG_NEGATIVES = new Set(["si", "chest_pain", "dyspnea", "bowel_bladder", "weakness", "syncope", "melena"]);

export function sectionKeyFor(template: Template, kinds: string[]) {
  for (const k of kinds) {
    const s = template.sections.find((x) => x.kind === k);
    if (s) return s.key;
  }
  return template.sections[0]?.key ?? "note";
}

function numbersIn(s: string) {
  return (s.match(/\b\d+(?:\.\d+)?(?:\/\d+)?\b/g) ?? []).filter((n) => !/^[1-9]$/.test(n));
}

export function scoreSupport(note: Note, utterances: Utterance[], chart?: Chart): Note {
  const byId = new Map(utterances.map((u) => [u.id, u]));
  const chartText = chart ? JSON.stringify(chart).toLowerCase() : "";
  const allText = utterances.map((u) => u.text).join(" ").toLowerCase().replace(/(\d{2,3})\s+over\s+(\d{2,3})/g, "$1/$2 $1 $2");
  const sections = note.sections.map((sec) => ({
    ...sec,
    sentences: sec.sentences.map((s): NoteSentence => {
      if (s.kind === "default" || s.kind === "system") return { ...s, support: s.kind === "system" ? "strong" : "none" };
      if (s.kind === "clinician" || s.edited) return { ...s, support: "strong" };
      if (s.kind === "carried") return { ...s, support: s.evidence.includes("chart") || chartText ? "strong" : "partial" };
      const valid = s.evidence.filter((id) => byId.has(id));
      if (!valid.length) {
        if (s.heading || /^\d+\.\s/.test(s.text)) return { ...s, evidence: valid, support: "partial" };
        return { ...s, evidence: valid, support: "none" };
      }
      if (note.meta.engine === "local") {
        const unsupportedNumber = numbersIn(s.text).some((n) => !allText.includes(n.toLowerCase()) && !chartText.includes(n.toLowerCase()) && !/^(?:[A-Z]\d{2}(?:\.\d+)?)$/.test(n));
        return { ...s, evidence: valid, support: unsupportedNumber ? "partial" : "strong" };
      }
      const source = valid.map((id) => byId.get(id)!.text).join(" ");
      const ov = overlap(s.text, source);
      const nums = numbersIn(s.text.replace(/\([A-Z]\d{2}(?:\.\d+)?\)/g, ""));
      const badNumber = nums.some((n) => !source.toLowerCase().includes(n) && !chartText.includes(n));
      const support = badNumber ? "none" : ov >= 0.3 ? "strong" : ov >= 0.12 ? "partial" : "none";
      return { ...s, evidence: valid, support };
    }),
  }));
  return { ...note, sections };
}

function noteText(note: Note) {
  return note.sections
    .flatMap((s) => s.sentences.filter((x) => !x.pending).map((x) => x.text))
    .join(" \n ")
    .toLowerCase();
}

function mentions(text: string, needle: string) {
  const n = needle.toLowerCase().split(/[\s/,-]+/).filter((w) => w.length > 2 && !/^(the|and|with|for|ratio|panel|unspecified)$/.test(w));
  if (!n.length) return text.includes(needle.toLowerCase());
  return n.some((w) => text.includes(w));
}

export function detectOmissions(note: Note, facts: Facts, template: Template): OmissionFlag[] {
  const text = noteText(note);
  const flags: OmissionFlag[] = [];
  const hpiKey = sectionKeyFor(template, ["hpi", "subjective"]);
  const apKey = sectionKeyFor(template, ["assessment_plan", "plan", "assessment"]);
  const objKey = sectionKeyFor(template, ["exam", "objective", "vitals"]);
  const vitKey = sectionKeyFor(template, ["vitals", "objective", "exam"]);
  const allergyKey = sectionKeyFor(template, ["allergies", "subjective", "hpi"]);
  let n = 0;
  const add = (f: Omit<OmissionFlag, "id">) => flags.push({ id: `om_${++n}`, ...f });

  for (const m of facts.meds) {
    if (m.cancelled) continue;
    if (["start", "stop", "increase", "decrease", "change", "refill"].includes(m.action) && !text.includes(m.name.split(" ")[0])) {
      const verb = { start: "Start", stop: "Discontinue", increase: "Increase", decrease: "Decrease", change: "Change", refill: "Refill" }[m.action as "start"];
      add({ category: "medication", text: `${verb} ${m.name} was discussed but is not in the note`, suggestion: `${verb} ${[m.name, m.dose, m.frequency].filter(Boolean).join(" ")}.`, section: apKey, evidence: m.evidence });
    }
    if ((m.action === "side_effect" || m.action === "not_taking") && !(text.includes(m.name.split(" ")[0]) && /(skip|miss|upset|side effect|adheren|not taking|stopped)/.test(text))) {
      add({ category: "medication", text: `Adherence or side-effect issue with ${m.name} is not documented`, suggestion: `Reports ${m.note ?? "issues"} with ${m.name}.`, section: hpiKey, evidence: m.evidence });
    }
  }

  for (const s of facts.symptoms) {
    const def = SYMPTOMS.find((d) => d.key === s.key);
    const present = text.includes(s.label.toLowerCase()) || (def?.patterns.some((re) => re.test(text)) ?? false);
    if (!s.negated && !present) {
      add({ category: "symptom", text: `Patient reported ${s.label}`, suggestion: `Also reports ${s.label}${s.duration ? ` for ${s.duration}` : ""}.`, section: hpiKey, evidence: s.evidence });
    }
    if (s.negated && RED_FLAG_NEGATIVES.has(s.key) && !present && !(s.key === "si" && text.includes("suicidal"))) {
      add({ category: "symptom", text: `Pertinent negative not documented: denies ${s.label}`, suggestion: `Denies ${s.label}.`, section: hpiKey, evidence: s.evidence });
    }
  }

  for (const a of facts.allergies) {
    if (!text.includes(a.substance.toLowerCase())) add({ category: "allergy", text: `Allergy to ${a.substance} stated during the visit`, suggestion: `Allergy: ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}.`, section: allergyKey, evidence: a.evidence });
  }

  for (const v of facts.vitals) {
    const raw = v.value.split(" ")[0].toLowerCase();
    const core = raw.replace(/s\b/g, "");
    if (!text.includes(raw) && !text.includes(core)) add({ category: "vital", text: `${v.name} ${v.value} was stated but not documented`, suggestion: `${v.name} ${v.value}.`, section: v.name === "Home BP" ? hpiKey : vitKey, evidence: v.evidence });
  }
  for (const r of facts.results) {
    const val = r.value.split(" ")[0];
    if (!text.includes(val)) add({ category: "vital", text: `${r.name} ${r.value} was reviewed but not documented`, suggestion: `${r.name}: ${r.value}.`, section: objKey, evidence: r.evidence });
  }

  for (const o of facts.orders) {
    const label = o.name.replace(/^Referral to /, "");
    if (!mentions(text, label)) add({ category: "order", text: `${o.name} was ordered verbally but is not in the plan`, suggestion: `${o.kind === "referral" ? "Refer to" : "Order"} ${label}${o.detail ? ` (${o.detail})` : ""}.`, section: apKey, evidence: o.evidence });
  }

  if (facts.followUp && !/follow[- ]?up|return in|recheck in|see (?:patient|you) (?:back )?in/.test(text)) {
    add({ category: "plan", text: "Follow-up interval was stated but not documented", suggestion: facts.followUp.text, section: apKey, evidence: facts.followUp.evidence });
  }
  if (facts.returnPrecautions.length && !/return precaution|go to the er|emergency|call (?:the office|911)|988/.test(text)) {
    add({ category: "plan", text: "Return precautions were given but not documented", suggestion: facts.returnPrecautions[0].text, section: apKey, evidence: facts.returnPrecautions[0].evidence });
  }

  for (const e of facts.exam.filter((x) => x.abnormal)) {
    const key = e.text.toLowerCase().match(/\b(red|bulging|tender|positive|wheez\w*|crackles|swollen|murmur|irregular|rash|edema|decreased|limited)\b/)?.[1];
    if (key && !text.includes(key)) add({ category: "exam", text: `Abnormal exam finding not documented: ${e.text}`, suggestion: `${e.system}: ${e.text}.`, section: objKey, evidence: e.evidence });
  }
  return flags;
}

export function supportStats(note: Note) {
  const all = note.sections.flatMap((s) => s.sentences.filter((x) => !x.pending && !x.heading));
  const strong = all.filter((s) => s.support === "strong").length;
  const partial = all.filter((s) => s.support === "partial").length;
  const none = all.filter((s) => s.support === "none").length;
  return { total: all.length, strong, partial, none, pct: all.length ? Math.round((strong / all.length) * 100) : 100 };
}
