import type { Chart, CodingResult, StagedOrder } from "../types";
import type { Facts } from "./extract";
import { wordToNumber } from "./text";

export interface PaCriterion {
  label: string;
  met: boolean | null;
  detail: string;
  evidence: string[];
}

export interface PaPacket {
  id: string;
  service: string;
  code: string;
  category: "imaging" | "medication";
  diagnoses: { code: string; label: string }[];
  criteria: PaCriterion[];
  status: "likely_approved" | "missing_criteria";
  letter: string;
  submission: "draft" | "submitted" | "approved" | "denied";
}

interface Ctx {
  chart?: Chart;
  patientName: string;
  dob: string;
  clinician: string;
  date: string;
  bmi?: number;
}

function durationWeeks(d?: string) {
  if (!d) return null;
  const m = /(\S+)\s+(day|week|month|year)s?/.exec(d.toLowerCase());
  if (!m) return null;
  const n = wordToNumber(m[1]) ?? Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return { day: n / 7, week: n, month: n * 4.3, year: n * 52 }[m[2] as "day"];
}

function a1c(facts: Facts, chart?: Chart) {
  const r = facts.results.find((x) => x.name === "Hemoglobin A1c");
  if (r) return { value: Number.parseFloat(r.value), evidence: r.evidence, source: "visit" };
  const l = chart?.labs?.find((x) => /a1c/i.test(x.name));
  if (l) return { value: Number.parseFloat(l.value), evidence: ["chart"], source: l.date };
  return null;
}

function metforminTrial(facts: Facts, chart?: Chart) {
  const visit = facts.meds.filter((m) => m.name === "metformin");
  const onChart = chart?.medications.some((m) => /metformin/i.test(m.name));
  const intolerance = visit.find((m) => m.action === "side_effect" || m.action === "not_taking");
  return { tried: !!onChart || visit.length > 0, intolerance, evidence: visit.flatMap((m) => m.evidence) };
}

function letterFor(p: Omit<PaPacket, "letter" | "id" | "status" | "submission">, ctx: Ctx, rationale: string) {
  const met = p.criteria.filter((c) => c.met);
  return [
    ctx.date,
    "",
    "To: Utilization Management / Pharmacy Benefit Review",
    `Re: Prior authorization request for ${p.service} (${p.code})`,
    `Patient: ${ctx.patientName}, DOB ${ctx.dob}`,
    `Diagnoses: ${p.diagnoses.map((d) => `${d.label} (${d.code})`).join("; ")}`,
    "",
    `I am requesting authorization for ${p.service} for my patient. ${rationale}`,
    "",
    "Clinical criteria met:",
    ...met.map((c) => `• ${c.label}: ${c.detail}`),
    "",
    "Supporting documentation (visit note, relevant results, and medication history) is attached. Please contact my office with any questions.",
    "",
    "Sincerely,",
    ctx.clinician,
  ].join("\n");
}

export function buildPriorAuths(facts: Facts, coding: CodingResult, orders: StagedOrder[], ctx: Ctx): PaPacket[] {
  const packets: PaPacket[] = [];
  const dxFor = (prefix: RegExp) => coding.diagnoses.filter((d) => prefix.test(d.code)).map((d) => ({ code: d.code, label: d.label }));
  let n = 0;
  const push = (p: Omit<PaPacket, "letter" | "id" | "status" | "submission">, rationale: string) => {
    const status: PaPacket["status"] = p.criteria.every((c) => c.met !== false) ? "likely_approved" : "missing_criteria";
    packets.push({ ...p, id: `pa_${++n}`, status, submission: "draft", letter: letterFor(p, ctx, rationale) });
  };

  for (const o of orders.filter((x) => x.status !== "rejected")) {
    if (o.name === "MRI, lumbar spine") {
      const back = facts.symptoms.find((s) => s.key === "back_pain" && !s.negated);
      const weeks = durationWeeks(back?.duration);
      const redFlags = facts.symptoms.filter((s) => ["bowel_bladder", "weakness", "fever", "weight_loss"].includes(s.key) && !s.negated);
      const conservative = facts.meds.some((m) => ["NSAID", "muscle relaxant", "analgesic"].includes(m.cls)) || facts.orders.some((x) => /Physical therapy/.test(x.name));
      push(
        {
          service: "MRI lumbar spine without contrast",
          code: "72148",
          category: "imaging",
          diagnoses: dxFor(/^M54|^M51|^M48/),
          criteria: [
            { label: "Symptoms for at least 6 weeks", met: weeks === null ? null : weeks >= 6, detail: back?.duration ? `Duration reported: ${back.duration}` : "Duration not documented", evidence: back?.evidence ?? [] },
            { label: "Failed conservative therapy", met: conservative, detail: conservative ? "NSAIDs/muscle relaxant or physical therapy documented" : "No trial of conservative therapy documented", evidence: facts.meds.filter((m) => m.cls === "NSAID").flatMap((m) => m.evidence) },
            { label: "Or red-flag symptoms present", met: redFlags.length ? true : null, detail: redFlags.length ? redFlags.map((r) => r.label).join(", ") : "No red flags reported", evidence: redFlags.flatMap((r) => r.evidence) },
          ].filter((c) => !(c.label.startsWith("Or") && c.met === null)),
          },
        "Imaging is indicated because symptoms have persisted despite conservative management.",
      );
    }
    if (/^(Start|Change) (semaglutide|tirzepatide|empagliflozin)/.test(o.name)) {
      const drug = o.name.split(" ")[1];
      const t2dm = dxFor(/^E11/);
      const lab = a1c(facts, ctx.chart);
      const mf = metforminTrial(facts, ctx.chart);
      const criteria: PaCriterion[] = [
        { label: "Diagnosis of type 2 diabetes", met: t2dm.length > 0, detail: t2dm.map((d) => `${d.label} (${d.code})`).join("; ") || "Not coded", evidence: facts.problems.find((p) => p.key === "t2dm")?.evidence.slice(0, 2) ?? [] },
        { label: "Hemoglobin A1c at or above 7%", met: lab ? lab.value >= 7 : null, detail: lab ? `A1c ${lab.value}% (${lab.source === "visit" ? "reviewed at this visit" : lab.source})` : "No A1c on file", evidence: lab?.evidence ?? [] },
        { label: "Trial of metformin (step therapy) or intolerance", met: mf.tried, detail: mf.intolerance ? `On metformin with intolerance: ${mf.intolerance.note ?? "side effects"}` : mf.tried ? "Currently on metformin" : "No metformin trial documented", evidence: mf.evidence },
      ];
      if (drug !== "empagliflozin" && !t2dm.length) {
        const bmi = ctx.bmi;
        criteria.push({ label: "BMI ≥30, or ≥27 with a weight-related comorbidity (weight-management indication)", met: bmi ? bmi >= 30 : null, detail: bmi ? `BMI ${bmi}` : "BMI not documented", evidence: [] });
      }
      push(
        { service: `${drug[0].toUpperCase()}${drug.slice(1)}`, code: drug === "empagliflozin" ? "Jardiance (NDC per pharmacy)" : "GLP-1 RA (NDC per pharmacy)", category: "medication", diagnoses: t2dm, criteria },
        `Glycemic control remains above goal on current therapy${mf.intolerance ? " and metformin is poorly tolerated" : ""}, so an additional agent is medically necessary.`,
      );
    }
    if (/^Start tiotropium/.test(o.name)) {
      const copd = dxFor(/^J44/);
      const symptomatic = facts.symptoms.filter((s) => ["dyspnea", "cough", "wheezing"].includes(s.key) && !s.negated);
      const wheeze = facts.exam.filter((e) => /wheez/i.test(e.text));
      const current = facts.meds.filter((m) => m.cls === "ICS/LABA");
      push(
        {
          service: "Tiotropium (long-acting muscarinic antagonist)",
          code: "Spiriva (NDC per pharmacy)",
          category: "medication",
          diagnoses: copd,
          criteria: [
            { label: "Diagnosis of COPD", met: copd.length > 0, detail: copd.map((d) => `${d.label} (${d.code})`).join("; ") || "Not coded", evidence: facts.problems.find((p) => p.key === "copd")?.evidence.slice(0, 2) ?? [] },
            { label: "Persistent symptoms on current maintenance therapy", met: symptomatic.length > 0 && (current.length > 0 || !!ctx.chart?.medications.some((m) => /budesonide|symbicort/i.test(m.name))), detail: `${symptomatic.map((s) => s.label).join(", ") || "no symptoms documented"}${wheeze.length ? `; exam: ${wheeze[0].text}` : ""}`, evidence: [...symptomatic.flatMap((s) => s.evidence), ...wheeze.flatMap((e) => e.evidence)].slice(0, 4) },
          ],
        },
        "Symptoms persist despite inhaled corticosteroid/long-acting beta agonist therapy, so adding a long-acting muscarinic antagonist is guideline-concordant (GOLD).",
      );
    }
  }
  return packets;
}
