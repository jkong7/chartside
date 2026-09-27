import { hcc, normalizeIcd, dotIcd, SEGMENT_LABEL, type HccSegment } from "../codesets";
import { CONDITIONS } from "../engine/lexicon";
import type { ChartProblem, RiskSummary } from "../types";

export function chartProblemCode(p: ChartProblem): string | null {
  if (p.icd10) return normalizeIcd(p.icd10);
  for (const c of CONDITIONS) {
    if (c.patterns.some((re) => re.test(p.name))) {
      const specific = c.specific?.find((s) => s.when.test(p.name));
      return normalizeIcd(specific?.icd10 ?? c.icd10);
    }
  }
  return null;
}

export function riskSummary(input: { visitCodes: string[]; chartProblems: ChartProblem[]; priorYearCodes: string[]; age: number; sex: string; segment?: string | null }): RiskSummary {
  const segment = (input.segment && input.segment in SEGMENT_LABEL ? input.segment : input.age >= 65 ? "COMMUNITY_NA" : "COMMUNITY_ND") as HccSegment;
  const patient = { age: input.age, sex: input.sex, segment };
  const visit = hcc.score(input.visitCodes, patient);
  const hccsOf = (codes: string[]) => new Set(codes.flatMap((c) => hcc.forCode(c, patient)));
  const capturedSet = hccsOf([...input.priorYearCodes, ...input.visitCodes]);
  const chart = input.chartProblems.map((p) => ({ p, code: chartProblemCode(p) })).filter((x): x is { p: ChartProblem; code: string } => !!x.code);
  const suspects: RiskSummary["suspects"] = [];
  const outstanding = new Set<string>();
  for (const { p, code } of chart) {
    const hs = hcc.forCode(code, patient);
    if (!hs.length) continue;
    const missing = hs.filter((h) => !capturedSet.has(h));
    if (!missing.length) continue;
    missing.forEach((h) => outstanding.add(h));
    const withIt = hcc.score([...input.visitCodes, code], patient);
    suspects.push({
      code: dotIcd(code),
      label: p.name,
      hccs: missing.map((h) => ({ hcc: h, label: hcc.label(h) })),
      delta: Math.round((withIt.total - visit.total) * 1000) / 1000,
      reason: input.priorYearCodes.length ? "On the problem list; not documented this visit or on any claim this calendar year" : "On the problem list; not documented this visit",
    });
  }
  suspects.sort((a, b) => b.delta - a.delta);
  return {
    segment,
    segmentLabel: SEGMENT_LABEL[segment],
    total: visit.total,
    demographic: visit.demographic,
    hccs: visit.hccs,
    interactions: visit.interactions,
    count: visit.count,
    suspects,
    recaptureYear: { captured: [...capturedSet].sort(), outstanding: [...outstanding].sort() },
    note: visit.note,
    source: visit.provenance,
  };
}
