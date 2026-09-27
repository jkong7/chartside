import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { extractFacts } from "@/lib/engine/extract";
import type { Patient, Utterance } from "@/lib/types";

export function demo(key: string) {
  const d = DEMO_PATIENTS.find((p) => p.key === key)!;
  const utterances: Utterance[] = d.script.map((l, i) => ({ id: `u${i}`, seq: i, speaker: l.s, text: l.t, tStart: i * 6, tEnd: i * 6 + 5 }));
  const patient: Patient = { id: `pat_${key}`, mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: d.language, chart: d.chart };
  const facts = extractFacts(utterances, d.chart, { pronouns: d.pronouns, sex: d.sex });
  return { d, utterances, patient, facts };
}

export const SCHEDULED = "2026-09-27T14:00:00.000Z";
