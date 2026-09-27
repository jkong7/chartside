import { hcc, icdReleaseFor, normalizeIcd, dotIcd, refMatches, type IcdRelease } from "../codesets";
import type { CdiQuery, DxDetail, DxIssue, RuleSource } from "../types";

export interface DxInput {
  code: string;
  label: string;
  problem?: string;
  evidence?: string[];
}

export interface DxContext {
  dos: string;
  age: number;
  sex: string;
  meds: string[];
}

const GUIDELINES = (ref: string, release: IcdRelease | null): RuleSource => ({ set: "ICD-10-CM Official Guidelines for Coding and Reporting", version: release?.meta.version ?? "FY2026", ref });
const TABULAR = (release: IcdRelease, at: string): RuleSource => ({ set: "ICD-10-CM Tabular List", version: release.meta.version, ref: at });

const INSULIN = /\binsulin|glargine|lispro|aspart|detemir|degludec|lantus|humalog|novolog|basaglar|tresiba\b/i;
const INJECTABLE_NON_INSULIN = /semaglutide|liraglutide|dulaglutide|tirzepatide|exenatide|ozempic|wegovy|victoza|trulicity|mounjaro|byetta|pramlintide/i;
const ORAL_HYPOGLYCEMIC = /metformin|glipizide|glyburide|glimepiride|sitagliptin|linagliptin|saxagliptin|alogliptin|empagliflozin|dapagliflozin|canagliflozin|ertugliflozin|pioglitazone|rybelsus|oral semaglutide|repaglinide|nateglinide|acarbose/i;

const MALE_ONLY: [string, string][] = [["N40", "N53"], ["C60", "C63"], ["D29", "D29"], ["D40", "D40"], ["Q53", "Q55"], ["Z125", "Z125"]];
const FEMALE_ONLY: [string, string][] = [["N70", "N98"], ["C51", "C58"], ["D25", "D28"], ["D39", "D39"], ["O00", "O9A"], ["Q50", "Q52"], ["Z014", "Z014"], ["Z124", "Z124"], ["Z30", "Z39"]];
const inRange = (code: string, ranges: [string, string][]) => ranges.some(([a, b]) => code.slice(0, a.length) >= a && code.slice(0, b.length) <= b);

let qid = 0;

function specificityQuery(release: IcdRelease, code: string, input: DxInput): CdiQuery | undefined {
  const entry = release.lookup(code);
  if (!entry || !entry.billable) return undefined;
  const unspecified = /unspecified/i.test(entry.long);
  if (!unspecified) return undefined;
  const options = release.siblings(code).filter((s) => s.code !== entry.code && s.billable && !/unspecified/i.test(s.long)).slice(0, 10);
  if (!options.length) return undefined;
  const parent = release.parentOf(code);
  const dims: string[] = [];
  const text = options.map((o) => o.long.toLowerCase()).join(" ");
  if (/\bright\b|\bleft\b|bilateral/.test(text)) dims.push("laterality");
  if (/stage/.test(text)) dims.push("stage");
  if (/mild|moderate|severe/.test(text)) dims.push("severity");
  if (/acute|chronic/.test(text)) dims.push("acuity");
  if (/with |without /.test(text)) dims.push("associated complications");
  if (/recurrent|single episode|episode/.test(text)) dims.push("episode");
  if (/type/.test(text)) dims.push("type");
  const subject = (parent?.long ?? input.label).replace(/,.*$/, "");
  return {
    id: `q_${(++qid).toString(36)}_${entry.code}`,
    code: entry.dotted,
    problem: input.problem,
    question: `The documentation supports "${entry.long}". Based on your clinical judgment, can ${subject.toLowerCase()} be further specified${dims.length ? ` (${dims.join(", ")})` : ""}?`,
    options: options.map((o) => ({ code: o.dotted, label: o.long })),
    evidence: input.evidence ?? [],
    source: { set: "ACDIS/AHIMA Guidelines for Achieving a Compliant Query Practice", version: "2022 update", ref: `Options from ICD-10-CM ${release.meta.version} ${parent?.dotted ?? ""}`.trim() },
    answer: null,
  };
}

export function reviewDiagnoses(list: DxInput[], ctx: DxContext): { details: DxDetail[]; issues: DxIssue[] } {
  const release = icdReleaseFor(ctx.dos);
  const issues: DxIssue[] = [];
  if (!release) {
    const details = list.map((d) => ({ code: d.code, label: d.label, official: null, billable: false, release: null, chapter: null, hccs: [], issues: [{ severity: "error" as const, rule: "ICD.RELEASE", message: `No ICD-10-CM release is loaded for the date of service ${ctx.dos}. Load the release in effect on that date.`, source: GUIDELINES("Section I.A", null) }] }));
    return { details, issues };
  }
  const codes = list.map((d) => normalizeIcd(d.code));
  const details: DxDetail[] = list.map((d, i) => {
    const code = codes[i];
    const own: DxIssue[] = [];
    const entry = release.lookup(code);
    const notes = release.notes(code);
    if (!entry) {
      const suggestions = release.search(d.label, 3).map((x) => x.dotted);
      own.push({ severity: "error", rule: "ICD.INVALID", message: `${dotIcd(code)} is not a valid ICD-10-CM code in ${release.meta.name}.${suggestions.length ? ` Closest matches: ${suggestions.join(", ")}.` : ""}`, source: { set: "ICD-10-CM", version: release.meta.version }, codes: suggestions });
    } else if (!entry.billable) {
      const kids = release.descendants(code);
      const seventh = notes.sevenChar && kids.some((k) => k.code.length === 7);
      own.push({
        severity: "error",
        rule: seventh ? "ICD.SEVENTH_CHARACTER" : "ICD.NOT_BILLABLE",
        message: seventh
          ? `${entry.dotted} needs a 7th character (${Object.entries(notes.sevenChar!.defs).map(([k, v]) => `${k} = ${v}`).join("; ")}). Choose one of ${kids.length} complete codes.`
          : `${entry.dotted} (${entry.long}) is a category header, not a billable code. Choose one of ${kids.length} more specific codes.`,
        source: seventh ? TABULAR(release, notes.sevenChar!.at) : GUIDELINES("Section I.B.2 (level of detail in coding)", release),
        codes: kids.slice(0, 12).map((k) => k.dotted),
      });
    }
    if (entry && /in diseases classified elsewhere/i.test(entry.long)) {
      const etiology = notes.codeFirst.flatMap((n) => n.refs);
      if (i === 0) own.push({ severity: "error", rule: "ICD.MANIFESTATION_FIRST", message: `${entry.dotted} is a manifestation code and can never be first-listed; sequence the underlying condition first.`, source: GUIDELINES("Section I.A.13 (etiology/manifestation convention)", release) });
      if (etiology.length && !codes.some((c, j) => j !== i && etiology.some((r) => refMatches(r, c)))) own.push({ severity: "error", rule: "ICD.CODE_FIRST", message: `${entry.dotted} requires the underlying condition to be coded first: ${notes.codeFirst.map((n) => n.text).join("; ")}.`, source: TABULAR(release, notes.codeFirst[0].at) });
    }
    const dm = /^E(0[89]|1[013])/.test(code);
    if (dm) {
      const meds = ctx.meds.join(" ");
      const want: [RegExp, string, string][] = [[INSULIN, "Z794", "Long term (current) use of insulin"], [INJECTABLE_NON_INSULIN, "Z7985", "Long-term (current) use of injectable non-insulin antidiabetic drug"], [ORAL_HYPOGLYCEMIC, "Z7984", "Long term (current) use of oral hypoglycemic drugs"]];
      const hits = want.filter(([re]) => re.test(meds));
      for (const [, z, label] of hits) {
        if (!codes.includes(z) && release.lookup(z)) own.push({ severity: "warning", rule: "ICD.USE_ADDITIONAL", message: `The medication list shows ${label.toLowerCase().replace(/^long[- ]term \(current\) use of /, "")}; the ${dotIcd(code.slice(0, 3))} category instructs "use additional code" ${dotIcd(z)} (${label}).`, source: TABULAR(release, notes.useAdditional[0]?.at ?? dotIcd(code.slice(0, 3))), codes: [dotIcd(z)] });
      }
    }
    if (entry && inRange(code, [["O00", "O9A"]]) && !(/^f/i.test(ctx.sex) && ctx.age >= 9 && ctx.age <= 64)) own.push({ severity: "error", rule: "ICD.MATERNITY_AGE_SEX", message: `${entry.dotted} is an obstetric code; it conflicts with the patient's age or sex.`, source: GUIDELINES("Section I.C.15.a (obstetric codes only on maternal records)", release) });
    if (entry && /^m/i.test(ctx.sex) && inRange(code, FEMALE_ONLY)) own.push({ severity: "error", rule: "ICD.SEX_CONFLICT", message: `${entry.dotted} (${entry.long}) applies to female anatomy but the patient is recorded as male.`, source: { set: "Chartside sex-conflict rule", version: "2026.3", ref: `ICD-10-CM ${release.meta.version} category ${code.slice(0, 3)}` } });
    if (entry && /^f/i.test(ctx.sex) && inRange(code, MALE_ONLY)) own.push({ severity: "error", rule: "ICD.SEX_CONFLICT", message: `${entry.dotted} (${entry.long}) applies to male anatomy but the patient is recorded as female.`, source: { set: "Chartside sex-conflict rule", version: "2026.3", ref: `ICD-10-CM ${release.meta.version} category ${code.slice(0, 3)}` } });
    const hccs = entry?.billable ? hcc.forCode(code, { age: ctx.age, sex: ctx.sex }).map((h) => ({ hcc: h, label: hcc.label(h) })) : [];
    const query = entry?.billable ? specificityQuery(release, code, d) : undefined;
    if (query) own.push({ severity: "info", rule: "ICD.SPECIFICITY", message: `${query.code} is an unspecified code; ${query.options.length} more specific options exist. A compliant query is ready for the clinician.`, source: query.source, codes: query.options.map((o) => o.code) });
    return { code: entry?.dotted ?? dotIcd(code), label: d.label, official: entry?.long ?? null, billable: !!entry?.billable, release: release.meta.version, chapter: notes.chapter, hccs, issues: own, ...(query ? { query } : {}), ...(d.problem ? { problem: d.problem } : {}) };
  });

  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const find = (x: number, y: number) => release.notes(codes[x]).excludes1.find((n) => n.refs.some((r) => refMatches(r, codes[y])));
      const hit = find(i, j) ?? find(j, i);
      if (!hit) continue;
      const [a, b] = find(i, j) ? [i, j] : [j, i];
      issues.push({ severity: "warning", rule: "ICD.EXCLUDES1", message: `${dotIcd(codes[a])} has an Excludes1 note for ${dotIcd(codes[b])} ("${hit.text}"). The two should not be reported together unless the conditions are unrelated; document why both apply or remove one.`, source: { ...TABULAR(release, hit.at), ref: `${hit.at}; Guidelines Section I.A.12.a` }, codes: [dotIcd(codes[a]), dotIcd(codes[b])] });
    }
  }
  const first = details[0];
  if (first && /^Z23$/.test(normalizeIcd(first.code)) && details.length > 1) issues.push({ severity: "info", rule: "ICD.SEQUENCE", message: "Z23 (encounter for immunization) is first-listed; when the visit also treats a problem, sequence the reason for the E/M first.", source: GUIDELINES("Section IV.G (first-listed condition)", release) });
  return { details, issues };
}
