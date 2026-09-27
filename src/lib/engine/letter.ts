import type { Note, Patient } from "../types";
import type { Facts } from "./extract";
import { ageFrom, joinList } from "./text";

export interface ReferralLetter {
  specialty: string;
  text: string;
}

export function buildReferralLetters(facts: Facts, note: Note, patient: Patient | null, clinician: { name: string; specialty: string }, at: Date): ReferralLetter[] {
  const referrals = facts.orders.filter((o) => o.kind === "referral");
  if (!referrals.length) return [];
  const hpi = note.sections.find((s) => /hpi|subjective/i.test(s.key))?.sentences.filter((s) => !s.pending && !/^Chief complaint/.test(s.text)).slice(0, 4).map((s) => s.text).join(" ") ?? "";
  const meds = patient?.chart.medications.map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" ")) ?? [];
  const newMeds = facts.meds.filter((m) => m.action === "start" && !m.cancelled).map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" "));
  const allergies = [...facts.allergies.map((a) => a.substance), ...(patient?.chart.allergies ?? []).map((a) => a.substance)];
  const results = facts.results.map((r) => `${r.name} ${r.value}`);
  const age = patient ? ageFrom(patient.dob, at) : null;
  return referrals.map((r) => {
    const specialty = r.name.replace(/^Referral to /, "");
    const problem = facts.problems.find((p) => p.key === r.problemKey) ?? facts.problems[0];
    const lines = [
      at.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      "",
      `Re: ${patient?.name ?? "Patient"}${patient ? `, DOB ${patient.dob}, MRN ${patient.mrn}` : ""}`,
      `Referral to: ${specialty}`,
      "",
      "Dear Colleague,",
      "",
      `Thank you for seeing ${patient?.name ?? "this patient"}${age !== null ? `, a ${age}-year-old` : ""}, whom I am referring for ${problem ? problem.label.toLowerCase() : "further evaluation"}${problem?.icd10 ? ` (${problem.icd10})` : ""}.`,
      "",
      hpi,
      "",
      results.length ? `Pertinent results: ${results.join("; ")}.` : "",
      `Current medications: ${meds.length ? joinList(meds) : "none"}${newMeds.length ? `. Started today: ${joinList(newMeds)}` : ""}.`,
      `Allergies: ${allergies.length ? joinList(Array.from(new Set(allergies))) : "no known drug allergies"}.`,
      "",
      `I would appreciate your evaluation and recommendations regarding ${problem ? problem.label.split(",")[0].toLowerCase() : "this concern"}. Please do not hesitate to contact me with any questions.`,
      "",
      "Sincerely,",
      "",
      clinician.name,
      clinician.specialty,
    ];
    return { specialty, text: lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n") };
  });
}
