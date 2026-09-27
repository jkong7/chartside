import type { Coverage, CoverageItem } from "../types";
import type { Facts } from "./extract";
import { SYMPTOMS } from "./lexicon";

const RED_FLAGS: Record<string, string[]> = {
  chest_pain: ["dyspnea", "syncope", "palpitations"],
  headache: ["vision_change", "weakness", "numbness", "fever"],
  back_pain: ["numbness", "weakness", "bowel_bladder", "fever"],
  cough: ["dyspnea", "fever", "chest_pain"],
  abdominal_pain: ["fever", "vomiting", "melena"],
  anxiety: ["si"],
  depressed_mood: ["si"],
  insomnia: ["si"],
  ear_pain: ["fever"],
  sore_throat: ["fever", "dyspnea"],
  dysuria: ["fever", "back_pain"],
  dizziness: ["syncope", "chest_pain", "weakness"],
  fever: ["dyspnea", "rash"],
  fatigue: ["weight_loss", "dyspnea"],
  dyspnea: ["chest_pain", "edema", "fever"],
  palpitations: ["chest_pain", "syncope", "dyspnea"],
  knee_pain: ["fever"],
  rash: ["fever", "dyspnea"],
};

const PAIN = /pain|ache/;

export function computeCoverage(facts: Facts, opts: { visitType?: string } = {}): Coverage {
  const items: CoverageItem[] = [];
  const cc = facts.chiefComplaint;
  const f = cc ? facts.symptoms.find((s) => s.key === cc.key) : undefined;
  if (f) {
    const hpi: [string, string, boolean, string?][] = [
      ["onset", "Onset / duration", !!(f.duration || f.onset), "How long has this been going on?"],
      ["severity", "Severity", !!f.severity, "On a scale of 1 to 10, how bad is it?"],
      ["timing", "Timing / pattern", !!f.timing, "Is it constant or does it come and go?"],
      ["modifying", "Aggravating / relieving factors", !!(f.aggravating?.length || f.relieving?.length || f.tried?.length), "What makes it better or worse? Tried anything?"],
      ["associated", "Associated symptoms", facts.symptoms.length > 1, "Any other symptoms with it?"],
    ];
    if (PAIN.test(f.label)) {
      hpi.splice(1, 0, ["location", "Location / radiation", !!(f.location || f.radiation || f.label !== "headache"), "Where exactly? Does it spread anywhere?"]);
      hpi.splice(3, 0, ["quality", "Quality", !!f.quality, "Is it sharp, dull, burning, pressure?"]);
    }
    for (const [key, label, met, hint] of hpi) items.push({ key: `hpi_${key}`, label, group: "hpi", met, evidence: met ? f.evidence : [], hint });
    for (const rf of RED_FLAGS[f.key] ?? []) {
      const def = SYMPTOMS.find((s) => s.key === rf);
      const hit = facts.symptoms.find((s) => s.key === rf);
      items.push({
        key: `rf_${rf}`,
        label: rf === "si" ? "Suicide / self-harm screen" : `Red flag: ${def?.label ?? rf}`,
        group: "safety",
        met: !!hit,
        evidence: hit?.evidence ?? [],
        hint: rf === "si" ? "Any thoughts of hurting yourself?" : `Ask about ${def?.label ?? rf}.`,
      });
    }
  }
  items.push({ key: "meds", label: "Medications reviewed", group: "history", met: facts.asked.meds.length > 0 || facts.meds.some((m) => m.action === "taking" || m.action === "side_effect"), evidence: facts.asked.meds.slice(0, 1), hint: "Any medications or supplements you're taking?" });
  items.push({ key: "allergies", label: "Allergies reviewed", group: "history", met: facts.asked.allergies.length > 0 || facts.allergies.length > 0 || !!facts.nkda, evidence: [...facts.asked.allergies, ...facts.allergies.flatMap((a) => a.evidence)].slice(0, 2), hint: "Any allergies to medications?" });
  if (opts.visitType === "new" || opts.visitType === "annual") {
    items.push({ key: "social", label: "Social history (tobacco, alcohol)", group: "history", met: facts.asked.social.length > 0 || facts.social.length > 0, evidence: facts.asked.social.slice(0, 1), hint: "Do you smoke or drink alcohol?" });
  }
  const planGiven = facts.problems.some((p) => p.plan.some((x) => x.type !== "reasoning"));
  items.push({ key: "plan", label: "Plan explained", group: "closing", met: planGiven, evidence: facts.problems.flatMap((p) => p.plan.slice(0, 1).flatMap((x) => x.evidence)).slice(0, 2) });
  items.push({ key: "followup", label: "Follow-up interval", group: "closing", met: !!facts.followUp, evidence: facts.followUp?.evidence ?? [], hint: "When should they come back?" });
  items.push({ key: "precautions", label: "Return precautions", group: "closing", met: facts.returnPrecautions.length > 0, evidence: facts.returnPrecautions[0]?.evidence ?? [], hint: "Tell them what should prompt a call or ER visit." });
  items.push({ key: "questions", label: "Questions invited", group: "closing", met: facts.asked.questions.length > 0, evidence: facts.asked.questions.slice(0, 1), hint: "What questions do you have for me?" });
  const met = items.filter((i) => i.met).length;
  return { chiefComplaint: cc?.label ?? null, items, score: items.length ? Math.round((met / items.length) * 100) : 0 };
}
