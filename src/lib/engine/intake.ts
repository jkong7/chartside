import type { Chart } from "../types";

export interface IntakeAnswers {
  reason?: string;
  symptoms?: string[];
  duration?: string;
  meds?: { name: string; status: "taking" | "stopped" | "different" | "not_sure"; note?: string }[];
  newMeds?: string;
  allergiesConfirmed?: boolean;
  newAllergies?: string;
  phq?: [number, number];
  gad?: [number, number];
  tobacco?: "never" | "former" | "current";
  auditc?: [number, number, number];
  falls?: "none" | "one" | "two_or_more";
  food?: boolean;
  housing?: boolean;
  transport?: boolean;
  questions?: string;
}

export interface IntakeSummary {
  flags: { level: "info" | "warn" | "urgent"; text: string }[];
  phq2: number | null;
  gad2: number | null;
  auditc: number | null;
  medChanges: string[];
  needs: string[];
}

export const SYMPTOMS = ["Fever", "Cough", "Shortness of breath", "Chest pain", "Headache", "Dizziness", "Nausea", "Pain", "Rash", "Trouble sleeping", "Low mood", "Anxiety", "Fatigue"];

export function summarizeIntake(a: IntakeAnswers, ctx: { sex?: string; age?: number } = {}): IntakeSummary {
  const flags: IntakeSummary["flags"] = [];
  const phq2 = a.phq ? a.phq[0] + a.phq[1] : null;
  const gad2 = a.gad ? a.gad[0] + a.gad[1] : null;
  const auditc = a.auditc ? a.auditc[0] + a.auditc[1] + a.auditc[2] : null;
  if ((a.symptoms ?? []).some((s) => /chest pain|shortness of breath/i.test(s))) flags.push({ level: "urgent", text: `Reports ${(a.symptoms ?? []).filter((s) => /chest pain|shortness of breath/i.test(s)).join(" and ").toLowerCase()}` });
  if (phq2 !== null && phq2 >= 3) flags.push({ level: "warn", text: `Positive PHQ-2 (${phq2}/6): complete a PHQ-9 and ask about safety` });
  if (gad2 !== null && gad2 >= 3) flags.push({ level: "warn", text: `Positive GAD-2 (${gad2}/6)` });
  const auditThreshold = ctx.sex === "F" ? 3 : 4;
  if (auditc !== null && auditc >= auditThreshold) flags.push({ level: "warn", text: `Positive AUDIT-C (${auditc}/12) for unhealthy alcohol use` });
  if (a.tobacco === "current") flags.push({ level: "info", text: "Current tobacco use: offer cessation support" });
  if (a.falls === "two_or_more" || a.falls === "one") flags.push({ level: "warn", text: `Reports ${a.falls === "one" ? "one fall" : "two or more falls"} in the past year` });
  const medChanges = (a.meds ?? []).filter((m) => m.status !== "taking").map((m) => `${m.name}: ${m.status === "stopped" ? "stopped taking" : m.status === "different" ? `taking differently${m.note ? ` (${m.note})` : ""}` : "not sure"}`);
  if (medChanges.length) flags.push({ level: "warn", text: `Medication list differs: ${medChanges.join("; ")}` });
  if (a.newMeds?.trim()) flags.push({ level: "info", text: `New medications or supplements: ${a.newMeds.trim()}` });
  if (a.allergiesConfirmed === false || a.newAllergies?.trim()) flags.push({ level: "warn", text: `Allergy update: ${a.newAllergies?.trim() || "patient says the allergy list is wrong"}` });
  const needs = [a.food ? "food insecurity" : null, a.housing ? "housing instability" : null, a.transport ? "transportation barriers" : null].filter(Boolean) as string[];
  if (needs.length) flags.push({ level: "warn", text: `Social needs: ${needs.join(", ")}` });
  return { flags, phq2, gad2, auditc, medChanges, needs };
}

export function intakeMedList(chart: Chart | null | undefined) {
  return (chart?.medications ?? []).map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" "));
}
