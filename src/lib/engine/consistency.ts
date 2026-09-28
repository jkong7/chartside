import type { Note, Patient } from "../types";
import { MEDICATIONS, SYMPTOMS } from "./lexicon";
import { ageFrom } from "./text";

export interface ConsistencyIssue {
  kind: "contradiction" | "laterality" | "age" | "pronoun" | "dose";
  message: string;
  sentenceIds: string[];
}

const NEG = /\b(?:denies|denied|no|not|negative for|without|absence of|free of|resolved)\b[^.;:]{0,40}$/i;
const COND = /\b(?:if|unless|should|in case|watch for|return precautions|call (?:us|911)|go to the (?:ER|emergency)|come back|return)\b/i;
const PARTS = ["knee", "shoulder", "hip", "ankle", "wrist", "elbow", "ear", "eye", "foot", "hand", "arm", "leg", "breast", "kidney", "flank", "calf", "thigh", "forearm"];
const CHANGE = /\b(?:increase|decrease|reduc|chang|switch|taper|titrat|from|previously|was on|down to|up to|stop|hold)\w*/i;

function sentences(note: Note) {
  return note.sections.flatMap((s) => s.sentences.filter((x) => !x.pending).map((x) => ({ id: x.id, text: x.text, section: s.key })));
}

export function checkConsistency(note: Note, patient: Pick<Patient, "dob" | "sex" | "pronouns"> | null, at: Date): ConsistencyIssue[] {
  const all = sentences(note);
  const out: ConsistencyIssue[] = [];

  for (const sym of SYMPTOMS) {
    const pos: string[] = [];
    const neg: string[] = [];
    for (const s of all) {
      for (const re of sym.patterns) {
        const m = re.exec(s.text);
        if (!m) continue;
        const before = s.text.slice(0, m.index);
        if (COND.test(before) || /^(?:patient_instructions|follow_up|instructions|dc_instructions)/i.test(s.section)) break;
        (NEG.test(before) ? neg : pos).push(s.id);
        break;
      }
    }
    if (pos.length && neg.length) out.push({ kind: "contradiction", message: `${sym.label.charAt(0).toUpperCase()}${sym.label.slice(1)} is documented as both present and denied.`, sentenceIds: [...new Set([...pos, ...neg])] });
  }

  for (const part of PARTS) {
    const re = new RegExp(`\\b(left|right)\\s+(?:\\w+\\s+){0,2}${part}s?\\b|\\b${part}s?\\s*,?\\s*(left|right)\\b`, "gi");
    const sides = new Map<string, string[]>();
    let bilateral = false;
    for (const s of all) {
      if (new RegExp(`\\b(?:bilateral(?:ly)?|both)\\b[^.]*\\b${part}`, "i").test(s.text)) bilateral = true;
      for (const m of s.text.matchAll(re)) {
        const side = (m[1] ?? m[2]).toLowerCase();
        sides.set(side, [...(sides.get(side) ?? []), s.id]);
      }
    }
    if (sides.size === 2 && !bilateral) out.push({ kind: "laterality", message: `The note mentions both the left and right ${part}. Confirm the side.`, sentenceIds: [...new Set([...sides.get("left")!, ...sides.get("right")!])] });
  }

  if (patient?.dob) {
    const age = ageFrom(patient.dob, at);
    for (const s of all) {
      const m = /\b(\d{1,3})-year-old\b/.exec(s.text);
      if (m && Math.abs(Number(m[1]) - age) >= 1 && !/\b(?:son|daughter|child|mother|father|husband|wife|partner|brother|sister)\b/i.test(s.text.slice(m.index, m.index + 60))) out.push({ kind: "age", message: `The note says ${m[1]}-year-old, but the patient is ${age}.`, sentenceIds: [s.id] });
    }
  }

  if (patient) {
    const she = /\bshe\b|\bher\b/i.test(patient.pronouns ?? "") || (!patient.pronouns && patient.sex === "F");
    const he = /\bhe\b|\bhim\b|\bhis\b/i.test(patient.pronouns ?? "") || (!patient.pronouns && patient.sex === "M");
    if (she !== he) {
      const narrative = all.filter((s) => /^(?:hpi|subjective|interval|history|participation|behavior|data)/i.test(s.section));
      const wrong = narrative.filter((s) => (she ? /\b(?:He|he)\s+(?:is|was|has|reports|states|denies|notes|presents|describes|takes|feels)\b/ : /\b(?:She|she)\s+(?:is|was|has|reports|states|denies|notes|presents|describes|takes|feels)\b/).test(s.text));
      if (wrong.length) out.push({ kind: "pronoun", message: `The history uses ${she ? "he" : "she"}, but the patient's pronouns are ${patient.pronouns || (she ? "she/her" : "he/him")}.`, sentenceIds: wrong.map((s) => s.id) });
    }
  }

  for (const med of MEDICATIONS) {
    const doses = new Map<string, string[]>();
    let changed = false;
    for (const s of all) {
      for (const re of med.patterns) {
        const m = re.exec(s.text);
        if (!m) continue;
        const d = /\b(\d+(?:\.\d+)?)\s*(?:mg|mcg|units?)\b/i.exec(s.text.slice(m.index, m.index + 40));
        if (d) doses.set(d[1], [...(doses.get(d[1]) ?? []), s.id]);
        if (CHANGE.test(s.text)) changed = true;
        break;
      }
    }
    if (doses.size > 1 && !changed) out.push({ kind: "dose", message: `${med.name} appears with different doses (${[...doses.keys()].join(" and ")}) and no dose change is documented.`, sentenceIds: [...new Set([...doses.values()].flat())] });
  }
  return out;
}
