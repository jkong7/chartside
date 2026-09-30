import type { Note, Patient, Utterance } from "../../types";
import { extractFacts } from "../extract";
import { buildNote, noteToText } from "../note";
import { systemTemplate } from "../templates";
import type { PracticeCase, Turn } from "./types";

export function practicePatient(c: PracticeCase, at = new Date()): Patient {
  const dob = new Date(Date.UTC(at.getUTCFullYear() - c.patient.age, 0, 15)).toISOString().slice(0, 10);
  return { id: `practice_${c.id}`, mrn: "PRACTICE", name: c.patient.name, dob, sex: c.patient.sex, pronouns: c.patient.sex === "F" ? "she/her" : "he/him", language: "en", chart: { problems: [], medications: [], allergies: [] } };
}

export function practiceUtterances(turns: Turn[]): Utterance[] {
  return turns
    .filter((t) => t.role !== "system")
    .map((t, i) => {
      const text = t.role === "exam" ? `On exam, ${t.text.replace(/\.$/, "")}.` : t.text;
      return { id: `u${i + 1}`, seq: i + 1, speaker: t.role === "patient" ? "patient" : "clinician", text, tStart: t.t, tEnd: t.t + Math.max(1, Math.round(text.split(" ").length / 2.5)), source: "typed" as const };
    });
}

export function referenceNote(c: PracticeCase, turns: Turn[]): { note: Note; text: string } {
  const patient = practicePatient(c);
  const utterances = practiceUtterances(turns);
  const template = systemTemplate("soap")!;
  const facts = extractFacts(utterances, patient.chart, { pronouns: patient.pronouns, sex: patient.sex });
  const note = buildNote(facts, { patient, encounter: { reason: c.title, visitType: "new", scheduledAt: new Date().toISOString() }, template, utterances, minutes: Math.round((turns.at(-1)?.t ?? 0) / 60) });
  return { note, text: noteToText(note) };
}
