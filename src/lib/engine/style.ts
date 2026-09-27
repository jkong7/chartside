import type { Note, NoteSentence, StyleRule } from "../types";
import { wordCount } from "./text";

export type RuleCandidate = Omit<StyleRule, "id" | "active" | "support" | "source">;

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bessential hypertension\b/gi, "HTN"],
  [/\bhypertension\b/gi, "HTN"],
  [/\btype 2 diabetes mellitus\b/gi, "T2DM"],
  [/\btype 2 diabetes\b/gi, "T2DM"],
  [/\bhyperlipidemia\b/gi, "HLD"],
  [/\bshortness of breath\b/gi, "SOB"],
  [/\bfollow up\b/gi, "f/u"],
  [/\btwice daily\b/gi, "BID"],
  [/\bthree times daily\b/gi, "TID"],
  [/\bas needed\b/gi, "PRN"],
  [/\bno known drug allergies\b/gi, "NKDA"],
  [/\bupper respiratory infection\b/gi, "URI"],
  [/\bgeneralized anxiety disorder\b/gi, "GAD"],
];

function lead(text: string, n = 3) {
  return text.toLowerCase().replace(/[^a-z0-9\s:]/g, "").split(/\s+/).slice(0, n).join(" ");
}

function sectionWords(sentences: NoteSentence[]) {
  return sentences.filter((s) => !s.pending).reduce((n, s) => n + wordCount(s.text), 0);
}

export function learnFromEdits(generated: Note, final: Note): RuleCandidate[] {
  const rules: RuleCandidate[] = [];
  for (const gsec of generated.sections) {
    const fsec = final.sections.find((s) => s.key === gsec.key);
    if (!fsec) continue;
    const gw = sectionWords(gsec.sentences);
    const fw = sectionWords(fsec.sentences);
    if (gw >= 40 && fw > 0 && fw / gw < 0.7) {
      const cap = Math.max(25, Math.round((fw * 1.1) / 5) * 5);
      rules.push({ kind: "max_words", section: gsec.key, value: String(cap), label: `Keep ${gsec.title} under ${cap} words` });
    }
    const finalTexts = new Set(fsec.sentences.map((s) => s.text.trim().toLowerCase()));
    const finalIds = new Set(fsec.sentences.map((s) => s.id));
    for (const s of gsec.sentences) {
      if (s.pending || s.heading) continue;
      const removed = !finalIds.has(s.id) && !finalTexts.has(s.text.trim().toLowerCase());
      if (removed) {
        const l = lead(s.text, s.text.includes(":") ? s.text.split(":")[0].split(/\s+/).length : 3);
        if (l.split(" ").length >= 2) rules.push({ kind: "drop_phrase", section: gsec.key, value: l, label: `Omit lines starting "${s.text.split(/\s+/).slice(0, 4).join(" ")}…" in ${gsec.title}` });
      }
    }
    const genTexts = new Set(gsec.sentences.map((s) => s.text.trim().toLowerCase()));
    for (const s of fsec.sentences) {
      if (s.kind === "clinician" && !genTexts.has(s.text.trim().toLowerCase()) && wordCount(s.text) <= 20) {
        rules.push({ kind: "always_include", section: fsec.key, value: s.text.trim(), label: `Always add "${s.text.trim()}" to ${fsec.title}` });
      }
    }
  }
  const finalText = final.sections.flatMap((s) => s.sentences.map((x) => x.text)).join(" ");
  const genText = generated.sections.flatMap((s) => s.sentences.map((x) => x.text)).join(" ");
  const abbrevHits = ABBREVIATIONS.filter(([re, abbr]) => new RegExp(`\\b${abbr.replace("/", "\\/")}\\b`).test(finalText) && re.test(genText)).length;
  if (abbrevHits >= 2) rules.push({ kind: "abbreviate", section: "*", value: "standard", label: "Use standard clinical abbreviations (HTN, T2DM, BID, PRN…)" });
  return rules;
}

export function applyStyle(note: Note, rules: StyleRule[]): Note {
  const active = rules.filter((r) => r.active);
  if (!active.length) return note;
  const sections = note.sections.map((sec) => {
    let sentences = [...sec.sentences];
    for (const r of active.filter((x) => x.section === sec.key || x.section === "*")) {
      if (r.kind === "drop_phrase") sentences = sentences.filter((s) => s.heading || !lead(s.text, r.value.split(" ").length).startsWith(r.value));
      if (r.kind === "always_include" && !sentences.some((s) => s.text.trim().toLowerCase() === r.value.toLowerCase())) {
        sentences.push({ id: `${sec.key}_style_${r.id}`, text: r.value, evidence: [], kind: "clinician", support: "strong" });
      }
      if (r.kind === "abbreviate") {
        sentences = sentences.map((s) => {
          let t = s.text;
          for (const [re, abbr] of ABBREVIATIONS) t = t.replace(re, abbr);
          return t === s.text ? s : { ...s, text: t };
        });
      }
    }
    const cap = active.find((r) => r.kind === "max_words" && r.section === sec.key);
    if (cap) {
      const limit = Number(cap.value);
      const keep: NoteSentence[] = [];
      let words = 0;
      const priority = (s: NoteSentence, i: number) => (s.heading ? 0 : i === 0 ? 1 : /denies|rated|not at goal|allerg/i.test(s.text) ? 2 : s.kind === "carried" ? 5 : 3);
      const ranked = sentences.map((s, i) => ({ s, i, p: priority(s, i) })).sort((a, b) => a.p - b.p || a.i - b.i);
      const chosen = new Set<string>();
      for (const { s } of ranked) {
        const wc = wordCount(s.text);
        if (s.pending || s.heading || words + wc <= limit || chosen.size === 0) {
          chosen.add(s.id);
          if (!s.pending) words += wc;
        }
      }
      for (const s of sentences) if (chosen.has(s.id)) keep.push(s);
      sentences = keep;
    }
    return { ...sec, sentences };
  });
  return { ...note, sections };
}

export function styleInstructions(rules: StyleRule[]) {
  return rules.filter((r) => r.active).map((r) => `- ${r.label}`).join("\n");
}
