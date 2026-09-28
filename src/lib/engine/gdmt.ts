import type { Chart, NoteSentence, Utterance } from "../types";

export type PillarStatus = "at_target" | "below_target" | "missing" | "held" | "not_evidence_based";

export interface Pillar {
  key: "raas" | "bb" | "mra" | "sglt2";
  label: string;
  status: PillarStatus;
  current: string | null;
  target: string;
  note: string;
}

export interface GdmtInput {
  ef: number | null;
  meds: { name: string; dose?: string; frequency?: string }[];
  potassium: number | null;
  egfr: number | null;
  sbp: number | null;
  hr: number | null;
  weightKg: number | null;
  angioedema: boolean;
}

const mg = (dose?: string) => {
  const m = dose ? /(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*mg/i.exec(dose) : null;
  return m ? Number(m[1]) : null;
};
const twice = (f?: string) => /\b(?:twice|bid|b\.i\.d|every 12)\b/i.test(f ?? "");
const has = (meds: GdmtInput["meds"], re: RegExp) => meds.find((m) => re.test(m.name));

export function efFrom(utts: Utterance[], chart?: Chart | null) {
  for (const u of [...utts].reverse()) {
    const m = /\b(?:ejection fraction|EF|LVEF)\b[^\d]{0,25}(\d{1,2})(?:\s*(?:to|-)\s*(\d{1,2}))?\s*(?:%|percent)/i.exec(u.text);
    if (m) return { ef: m[2] ? Math.round((Number(m[1]) + Number(m[2])) / 2) : Number(m[1]), evidence: [u.id] };
  }
  const lab = chart?.labs?.find((l) => /\b(?:LVEF|ejection fraction)\b/i.test(l.name));
  const v = lab ? Number.parseFloat(lab.value) : NaN;
  return Number.isFinite(v) ? { ef: v, evidence: ["chart"] } : null;
}

export function gdmtPlan(x: GdmtInput): Pillar[] | null {
  if (x.ef === null || x.ef > 40) return null;
  const hiK = x.potassium !== null && x.potassium >= 5;
  const lowGfr = (n: number) => x.egfr !== null && x.egfr < n;
  const lowBp = x.sbp !== null && x.sbp < 100;
  const out: Pillar[] = [];

  const arni = has(x.meds, /sacubitril|entresto/i);
  const acei = has(x.meds, /pril\b|lisinopril|enalapril|ramipril|captopril/i);
  const arb = has(x.meds, /sartan\b|losartan|valsartan|candesartan/i);
  const raas = arni ?? acei ?? arb;
  if (arni) {
    const d = mg(arni.dose);
    out.push({ key: "raas", label: "ARNI / ACE inhibitor / ARB", status: d !== null && d >= 97 && twice(arni.frequency) ? "at_target" : "below_target", current: [arni.name, arni.dose, arni.frequency].filter(Boolean).join(" "), target: "sacubitril-valsartan 97/103 mg twice daily", note: lowBp ? "SBP under 100: titrate cautiously." : "Uptitrate every 2 to 4 weeks as blood pressure allows." });
  } else if (raas) {
    out.push({ key: "raas", label: "ARNI / ACE inhibitor / ARB", status: "below_target", current: [raas.name, raas.dose, raas.frequency].filter(Boolean).join(" "), target: "switch to sacubitril-valsartan (ARNI preferred in NYHA II to III)", note: x.angioedema ? "History of angioedema: ARNI is contraindicated; continue ACE inhibitor or ARB at target dose." : acei ? "If switching from an ACE inhibitor to an ARNI, stop the ACE inhibitor 36 hours first." : "ARB to ARNI can be switched without a washout." });
  } else {
    const held = hiK || lowGfr(30) || lowBp;
    out.push({ key: "raas", label: "ARNI / ACE inhibitor / ARB", status: held ? "held" : "missing", current: null, target: "sacubitril-valsartan 24/26 mg twice daily, uptitrate to 97/103 mg", note: held ? `Hold for now: ${[hiK ? `potassium ${x.potassium}` : "", lowGfr(30) ? `eGFR ${x.egfr}` : "", lowBp ? `SBP ${x.sbp}` : ""].filter(Boolean).join(", ")}.` : x.angioedema ? "History of angioedema: use an ARB, not an ARNI or ACE inhibitor." : "No renin-angiotensin therapy on file." });
  }

  const tartrate = x.meds.find((m) => /metoprolol/i.test(m.name) && /tartrate|lopressor/i.test(`${m.name} ${m.dose ?? ""}`));
  const bb = x.meds.find((m) => /carvedilol|bisoprolol|coreg|zebeta/i.test(m.name) || (/metoprolol/i.test(m.name) && !/tartrate|lopressor/i.test(`${m.name} ${m.dose ?? ""}`)));
  const lowHr = x.hr !== null && x.hr < 60;
  if (bb) {
    const d = mg(bb.dose);
    const [target, ok] = /carvedilol|coreg/i.test(bb.name) ? [x.weightKg !== null && x.weightKg > 85 ? "carvedilol 50 mg twice daily" : "carvedilol 25 mg twice daily", d !== null && d >= (x.weightKg !== null && x.weightKg > 85 ? 50 : 25)] : /bisoprolol|zebeta/i.test(bb.name) ? ["bisoprolol 10 mg daily", d !== null && d >= 10] : ["metoprolol succinate 200 mg daily", d !== null && d >= 200];
    out.push({ key: "bb", label: "Evidence-based beta blocker", status: ok ? "at_target" : "below_target", current: [bb.name, bb.dose, bb.frequency].filter(Boolean).join(" "), target: target as string, note: lowHr ? `Heart rate ${x.hr}: hold uptitration.` : "Uptitrate every 2 weeks as heart rate and symptoms allow." });
  } else if (tartrate) {
    out.push({ key: "bb", label: "Evidence-based beta blocker", status: "not_evidence_based", current: [tartrate.name, tartrate.dose, tartrate.frequency].filter(Boolean).join(" "), target: "metoprolol succinate, carvedilol, or bisoprolol", note: "Metoprolol tartrate is not an evidence-based beta blocker for HFrEF; switch to an equivalent dose of metoprolol succinate." });
  } else {
    out.push({ key: "bb", label: "Evidence-based beta blocker", status: lowHr ? "held" : "missing", current: null, target: "carvedilol 3.125 mg twice daily or metoprolol succinate 12.5 to 25 mg daily, uptitrate", note: lowHr ? `Heart rate ${x.hr}: defer.` : "No evidence-based beta blocker on file." });
  }

  const mra = has(x.meds, /spironolactone|eplerenone|aldactone|inspra/i);
  if (mra) out.push({ key: "mra", label: "Mineralocorticoid receptor antagonist", status: (mg(mra.dose) ?? 0) >= 25 ? "at_target" : "below_target", current: [mra.name, mra.dose, mra.frequency].filter(Boolean).join(" "), target: /eplerenone|inspra/i.test(mra.name) ? "eplerenone 50 mg daily" : "spironolactone 25 mg daily", note: hiK ? `Potassium ${x.potassium}: hold or reduce.` : "Check potassium and creatinine at 1 week, 4 weeks, then every 3 months." });
  else out.push({ key: "mra", label: "Mineralocorticoid receptor antagonist", status: hiK || lowGfr(30) ? "held" : "missing", current: null, target: "spironolactone 12.5 to 25 mg daily", note: hiK || lowGfr(30) ? `Not recommended: ${[hiK ? `potassium ${x.potassium}` : "", lowGfr(30) ? `eGFR ${x.egfr}` : ""].filter(Boolean).join(", ")} (needs eGFR over 30 and potassium under 5.0).` : "No MRA on file; eGFR and potassium allow one." });

  const sglt2 = has(x.meds, /gliflozin|jardiance|farxiga/i);
  if (sglt2) out.push({ key: "sglt2", label: "SGLT2 inhibitor", status: "at_target", current: [sglt2.name, sglt2.dose, sglt2.frequency].filter(Boolean).join(" "), target: "dapagliflozin or empagliflozin 10 mg daily", note: "No titration needed." });
  else out.push({ key: "sglt2", label: "SGLT2 inhibitor", status: lowGfr(20) ? "held" : "missing", current: null, target: "dapagliflozin or empagliflozin 10 mg daily", note: lowGfr(20) ? `eGFR ${x.egfr}: below the studied range.` : "Benefit regardless of diabetes status." });
  return out;
}

const LABEL: Record<PillarStatus, string> = { at_target: "at target", below_target: "below target", missing: "not started", held: "held", not_evidence_based: "not evidence-based" };

export function gdmtSentences(ef: { ef: number; evidence: string[] } | null, pillars: Pillar[] | null, key: string): NoteSentence[] {
  if (!ef) return [{ id: `${key}_1`, text: "LVEF: *** (needed to assess guideline-directed therapy).", evidence: [], kind: "system", support: "none" }];
  if (!pillars) return [{ id: `${key}_1`, text: `LVEF ${ef.ef}%: not in the reduced range; four-pillar HFrEF therapy does not apply.`, evidence: ef.evidence.filter((e) => e !== "chart"), kind: "fact", support: "strong" }];
  const onTarget = pillars.filter((p) => p.status === "at_target").length;
  return [
    { id: `${key}_1`, text: `HFrEF, LVEF ${ef.ef}%: ${onTarget} of 4 guideline-directed therapies at target dose.`, evidence: ef.evidence.filter((e) => e !== "chart"), kind: "fact", support: "strong" },
    ...pillars.map((p, i) => ({ id: `${key}_${i + 2}`, text: `${p.label}: ${LABEL[p.status]}${p.current ? ` (${p.current})` : ""}; target ${p.target}. ${p.note}`, evidence: [], kind: "system" as const, support: "strong" as const })),
  ];
}

export function gdmtFor(utts: Utterance[], facts: import("./extract").Facts, chart: Chart | null | undefined) {
  const ef = efFrom(utts, chart);
  const meds = new Map<string, { name: string; dose?: string; frequency?: string }>();
  for (const m of chart?.medications ?? []) meds.set(m.name.toLowerCase(), { name: m.name, dose: m.dose, frequency: m.frequency });
  for (const m of facts.meds) {
    if (m.cancelled) continue;
    const key = [...meds.keys()].find((k) => k.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(k)) ?? m.name.toLowerCase();
    if (m.action === "stop") meds.delete(key);
    else if (["start", "increase", "decrease", "change", "continue", "taking"].includes(m.action)) meds.set(key, { name: meds.get(key)?.name ?? m.name, dose: m.dose ?? meds.get(key)?.dose, frequency: m.frequency ?? meds.get(key)?.frequency });
  }
  const val = (name: RegExp) => {
    const r = facts.results.find((x) => name.test(x.name))?.value ?? chart?.labs?.filter((l) => name.test(l.name)).at(-1)?.value;
    const n = r ? Number.parseFloat(r) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const bp = facts.vitals.find((v) => v.name === "BP")?.value ?? chart?.vitals?.BP;
  const hr = facts.vitals.find((v) => v.name === "HR")?.value;
  const wt = facts.vitals.find((v) => v.name === "Weight")?.value ?? chart?.vitals?.Weight;
  const kg = wt ? (/lb/i.test(wt) ? Number.parseFloat(wt) / 2.2046 : Number.parseFloat(wt)) : null;
  const input: GdmtInput = {
    ef: ef?.ef ?? null,
    meds: [...meds.values()],
    potassium: val(/^potassium/i),
    egfr: chart?.egfr ?? val(/egfr/i),
    sbp: bp ? Number.parseInt(bp, 10) : null,
    hr: hr ? Number.parseInt(hr, 10) : null,
    weightKg: kg && Number.isFinite(kg) ? kg : null,
    angioedema: (chart?.allergies ?? []).some((a) => /angioedema/i.test(`${a.substance} ${a.reaction ?? ""}`)),
  };
  return { ef, pillars: gdmtPlan(input), input };
}
