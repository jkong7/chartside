import type { Chart } from "../types";

export interface Snippet {
  id: string;
  trigger: string;
  name: string;
  body: string;
  shared?: boolean;
  system?: boolean;
  ownedByMe?: boolean;
}

export const SYSTEM_SNIPPETS: Snippet[] = [
  { id: "sys_exam_normal", trigger: "exam", name: "Normal exam", system: true, body: "General: well-appearing, no acute distress.\nHEENT: normocephalic, atraumatic; oropharynx clear.\nNeck: supple, no lymphadenopathy.\nLungs: clear to auscultation bilaterally, no wheezes or crackles.\nHeart: regular rate and rhythm, no murmurs.\nAbdomen: soft, non-tender, non-distended.\nExtremities: no edema.\nNeuro: alert and oriented, no focal deficits." },
  { id: "sys_lungs_normal", trigger: "lungs", name: "Normal lungs", system: true, body: "Lungs clear to auscultation bilaterally with normal work of breathing; no wheezes, rales, or rhonchi." },
  { id: "sys_ros_neg", trigger: "rosneg", name: "Negative ROS", system: true, body: "All other systems reviewed and negative except as noted in the HPI." },
  { id: "sys_return", trigger: "return", name: "Return precautions", system: true, body: "Return precautions reviewed: seek care right away for worsening symptoms, fever over 101°F, chest pain, trouble breathing, or any new concerns. {{patient.first}} verbalized understanding." },
  { id: "sys_meds_reviewed", trigger: "medrec", name: "Medication reconciliation", system: true, body: "Medications reviewed and reconciled with the patient: {{meds}}. Allergies: {{allergies}}." },
  { id: "sys_tobacco", trigger: "tobacco", name: "Tobacco cessation counseling", system: true, body: "Counseled {{patient.first}} on tobacco cessation for *** minutes, including health risks, pharmacotherapy options, and quitline resources (1-800-QUIT-NOW)." },
  { id: "sys_time", trigger: "time", name: "Time attestation", system: true, body: "I spent *** minutes on the date of the encounter, including reviewing records, examining the patient, counseling, ordering, and documenting." },
];

export interface SnippetContext {
  patient?: { name: string; dob: string; sex: string; pronouns?: string } | null;
  chart?: Chart | null;
  clinician?: string;
  today?: Date;
}

function age(dob: string, at: Date) {
  const d = new Date(dob);
  let a = at.getFullYear() - d.getFullYear();
  if (at.getMonth() < d.getMonth() || (at.getMonth() === d.getMonth() && at.getDate() < d.getDate())) a--;
  return a;
}

export function expandSnippet(body: string, ctx: SnippetContext) {
  const today = ctx.today ?? new Date();
  const chart = ctx.chart;
  const vals: Record<string, string> = {
    "patient.name": ctx.patient?.name ?? "the patient",
    "patient.first": ctx.patient?.name.split(" ")[0] ?? "The patient",
    "patient.age": ctx.patient ? String(age(ctx.patient.dob, today)) : "***",
    "patient.sex": ctx.patient ? (ctx.patient.sex === "F" ? "female" : ctx.patient.sex === "M" ? "male" : "patient") : "***",
    meds: chart?.medications.length ? chart.medications.map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" ")).join("; ") : "none",
    allergies: chart?.allergies.length ? chart.allergies.map((a) => a.substance + (a.reaction ? ` (${a.reaction})` : "")).join(", ") : "no known drug allergies",
    problems: chart?.problems.length ? chart.problems.map((p) => p.name).join("; ") : "none",
    clinician: ctx.clinician ?? "***",
    today: today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  };
  for (const [k, v] of Object.entries(chart?.vitals ?? {})) vals[`vitals.${k}`] = v;
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => vals[k] ?? "***");
}

export function findSnippet(spoken: string, list: Snippet[]) {
  const s = spoken.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (!s) return null;
  const exact = list.find((x) => x.name.toLowerCase() === s || x.trigger.toLowerCase() === s.replace(/\s+/g, ""));
  if (exact) return exact;
  const words = s.split(/\s+/);
  let best: { sn: Snippet; score: number } | null = null;
  for (const sn of list) {
    const name = sn.name.toLowerCase();
    const score = words.filter((w) => name.includes(w)).length / Math.max(words.length, name.split(/\s+/).length);
    if (!best || score > best.score) best = { sn, score };
  }
  return best && best.score >= 0.5 ? best.sn : null;
}

export function validTrigger(t: string) {
  return /^[a-z0-9][a-z0-9-]{1,23}$/.test(t);
}
