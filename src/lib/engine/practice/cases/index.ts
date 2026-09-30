import type { PracticeCase } from "../types";
import { abdominalPain } from "./abdominalPain";
import { chestPain } from "./chestPain";
import { depression } from "./depression";
import { diabetes } from "./diabetes";
import { headache } from "./headache";
import { lowBackPain } from "./lowBackPain";
import { pediatricFever } from "./pediatricFever";
import { shortnessOfBreath } from "./shortnessOfBreath";

export const CASES: PracticeCase[] = [chestPain, abdominalPain, headache, diabetes, depression, pediatricFever, lowBackPain, shortnessOfBreath];

export function practiceCase(id: string | null | undefined) {
  return CASES.find((c) => c.id === id) ?? null;
}

export interface DoorCard {
  id: string;
  title: string;
  specialty: string;
  blurb: string;
  patient: { name: string; age: string; sex: "F" | "M"; affect: string; speaker: string | null };
  door: PracticeCase["door"];
  exam: { key: string; label: string }[];
}

export function ageLabel(c: PracticeCase) {
  return c.patient.age === 1 ? "18 months" : `${c.patient.age}`;
}

export function doorCard(c: PracticeCase): DoorCard {
  return {
    id: c.id,
    title: c.title,
    specialty: c.specialty,
    blurb: c.blurb,
    patient: { name: c.patient.name, age: ageLabel(c), sex: c.patient.sex, affect: c.patient.affect, speaker: c.patient.speaker ? `${c.patient.speaker.name}, ${c.patient.speaker.relation}` : null },
    door: c.door,
    exam: c.exam.map((e) => ({ key: e.key, label: e.label })),
  };
}
