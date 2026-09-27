import type { Chart, OrderAlert, StagedOrder } from "../types";
import { allergyConflicts, type Facts } from "./extract";
import { MEDICATIONS } from "./lexicon";

export interface OrderContext {
  chart?: Chart;
  ageYears?: number;
  now?: Date;
}

const RAAS = new Set(["ACE inhibitor", "ARB"]);

function medAlerts(name: string, facts: Facts, ctx: OrderContext, action: string, dose?: string): OrderAlert[] {
  const alerts: OrderAlert[] = [];
  const def = MEDICATIONS.find((m) => m.name === name);
  const allergySubs = [...facts.allergies.map((a) => a.substance), ...(ctx.chart?.allergies ?? []).map((a) => a.substance)];
  if (action !== "stop") {
    for (const hit of allergyConflicts(name, allergySubs)) alerts.push({ level: "block", message: `Allergy conflict: patient is allergic to ${hit}.` });
  }
  const egfr = ctx.chart?.egfr;
  if (def?.renalCaution && egfr !== undefined && egfr < def.renalCaution && action !== "stop") {
    alerts.push({ level: "warn", message: `Renal dosing: eGFR ${egfr} is below ${def.renalCaution} for ${name}.` });
  } else if (def?.renalCaution && egfr !== undefined && egfr < def.renalCaution + 15 && action !== "stop") {
    alerts.push({ level: "info", message: `eGFR ${egfr}; monitor renal function on ${name}.` });
  }
  if (action === "start" && def) {
    const current = (ctx.chart?.medications ?? []).map((m) => MEDICATIONS.find((d) => m.name.toLowerCase().includes(d.name.split(" ")[0]))).filter(Boolean);
    const stopping = new Set(facts.meds.filter((m) => m.action === "stop").map((m) => m.name));
    for (const c of current) {
      if (!c || stopping.has(c.name) || c.name === def.name) continue;
      if (c.cls === def.cls) alerts.push({ level: "warn", message: `Therapeutic duplication: already taking ${c.name} (${c.cls}).` });
      else if (RAAS.has(c.cls) && RAAS.has(def.cls)) alerts.push({ level: "warn", message: `Dual RAAS blockade with ${c.name}; avoid combining ACE inhibitor and ARB.` });
      if (def.cls === "NSAID" && c.cls === "anticoagulant") alerts.push({ level: "warn", message: `Bleeding risk: NSAID with ${c.name}.` });
    }
  }
  if (ctx.ageYears !== undefined && ctx.ageYears < 18 && def?.rx && !dose && action !== "stop") {
    alerts.push({ level: "warn", message: "Pediatric patient: weight-based dose not specified." });
  }
  return alerts;
}

export function stageOrders(facts: Facts, ctx: OrderContext = {}): Omit<StagedOrder, "id">[] {
  const out: Omit<StagedOrder, "id">[] = [];
  const problemOf = (evidence: string[]) => facts.problems.find((p) => p.plan.some((it) => it.evidence.some((e) => evidence.includes(e))))?.label ?? "";
  const seen = new Set<string>();
  for (const m of facts.meds) {
    if (!["start", "stop", "increase", "decrease", "change", "refill"].includes(m.action)) continue;
    const key = `${m.name}:${m.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.cancelled && m.action === "stop") continue;
    const verb = { start: "Start", stop: "Discontinue", increase: "Increase", decrease: "Decrease", change: "Change", refill: "Refill" }[m.action as "start"];
    const detail = [m.note === "extended-release" ? "extended-release" : "", m.dose, m.frequency, m.note && m.note !== "extended-release" ? m.note : ""].filter(Boolean).join(" · ");
    const alerts = medAlerts(m.name, facts, ctx, m.action, m.dose);
    if (m.cancelled) alerts.unshift({ level: "info", message: "Cancelled during the visit." });
    out.push({
      kind: "medication",
      name: `${verb} ${m.name}`,
      detail,
      status: m.cancelled ? "rejected" : "staged",
      evidence: m.evidence,
      alerts,
      problem: problemOf(m.evidence),
    });
  }
  const at = ctx.now ?? new Date();
  for (const o of facts.orders) {
    const alerts: OrderAlert[] = [];
    const recent = ctx.chart?.labs?.find((l) => o.name.toLowerCase().includes(l.name.toLowerCase().split(" ")[0]) || l.name.toLowerCase().includes(o.name.toLowerCase().split(" ")[0]));
    if (recent) {
      const days = Math.round((at.getTime() - new Date(recent.date).getTime()) / 86400000);
      if (days >= 0 && days < 90) alerts.push({ level: "info", message: `Last resulted ${days} days ago (${recent.value}).` });
    }
    out.push({
      kind: o.kind === "procedure" ? "procedure" : o.kind,
      name: o.name,
      detail: [o.detail, o.cpt ? `CPT ${o.cpt}` : ""].filter(Boolean).join(" · "),
      status: "staged",
      evidence: o.evidence,
      alerts,
      problem: facts.problems.find((p) => p.key === o.problemKey)?.label ?? problemOf(o.evidence),
    });
  }
  if (facts.followUp) {
    out.push({ kind: "follow_up", name: `Return visit in ${facts.followUp.interval ?? ""}`.trim(), detail: "Schedule with front desk", status: "staged", evidence: facts.followUp.evidence, alerts: [], problem: "" });
  }
  return out;
}
