import type { Chart } from "../types";

export interface TrialCriteria {
  minAge?: number;
  maxAge?: number;
  sex?: "F" | "M";
  anyDx?: string[];
  labs?: { name: string; op: ">=" | "<="; value: number }[];
  excludeDx?: string[];
  excludeMeds?: string[];
}

export interface Trial {
  id: string;
  title: string;
  sponsor: string;
  nct: string | null;
  contact: string;
  status: "active" | "closed";
  criteria: TrialCriteria;
}

export interface TrialScreen {
  trialId: string;
  title: string;
  status: "likely" | "possible" | "excluded" | "no";
  met: string[];
  unmet: string[];
  unknown: string[];
}

export interface ScreenInput {
  age: number;
  sex: string;
  dx: string[];
  labs: { name: string; value: string }[];
  meds: string[];
}

const num = (v: string) => {
  const m = /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, ""));
  return m ? Number(m[0]) : null;
};

const dxMatch = (codes: string[], prefixes: string[]) => codes.filter((c) => prefixes.some((p) => c.toUpperCase().replace(".", "").startsWith(p.toUpperCase().replace(".", ""))));

export function screenInput(chart: Chart | null | undefined, age: number, sex: string, visit: { dx: string[]; results: { name: string; value: string }[]; meds: string[] }): ScreenInput {
  const labs = [...visit.results, ...(chart?.labs ?? []).map((l) => ({ name: l.name, value: l.value }))];
  return {
    age,
    sex,
    dx: Array.from(new Set([...visit.dx, ...(chart?.problems ?? []).map((p) => p.icd10).filter((c): c is string => !!c)])),
    labs,
    meds: Array.from(new Set([...visit.meds, ...(chart?.medications ?? []).map((m) => m.name)].map((m) => m.toLowerCase()))),
  };
}

export function screen(t: Trial, x: ScreenInput): TrialScreen {
  const c = t.criteria;
  const met: string[] = [];
  const unmet: string[] = [];
  const unknown: string[] = [];
  if (c.minAge !== undefined || c.maxAge !== undefined) {
    const ok = (c.minAge === undefined || x.age >= c.minAge) && (c.maxAge === undefined || x.age <= c.maxAge);
    (ok ? met : unmet).push(`Age ${x.age} (${c.minAge ?? 0} to ${c.maxAge ?? "any"})`);
  }
  if (c.sex) (x.sex === c.sex ? met : unmet).push(`Sex ${c.sex === "F" ? "female" : "male"}`);
  if (c.anyDx?.length) {
    const hit = dxMatch(x.dx, c.anyDx);
    if (hit.length) met.push(`Diagnosis ${hit.join(", ")}`);
    else unmet.push(`Diagnosis in ${c.anyDx.join(", ")}`);
  }
  for (const l of c.labs ?? []) {
    const found = x.labs.find((r) => r.name.toLowerCase() === l.name.toLowerCase());
    const v = found ? num(found.value) : null;
    if (v === null) unknown.push(`${l.name} ${l.op} ${l.value} (no result on file)`);
    else ((l.op === ">=" ? v >= l.value : v <= l.value) ? met : unmet).push(`${l.name} ${v} (needs ${l.op} ${l.value})`);
  }
  const exDx = c.excludeDx?.length ? dxMatch(x.dx, c.excludeDx) : [];
  const exMeds = (c.excludeMeds ?? []).filter((m) => x.meds.some((pm) => pm.includes(m.toLowerCase())));
  if (exDx.length || exMeds.length) {
    return { trialId: t.id, title: t.title, status: "excluded", met, unmet: [...unmet, ...exDx.map((d) => `Exclusion: diagnosis ${d}`), ...exMeds.map((m) => `Exclusion: taking ${m}`)], unknown };
  }
  const status = unmet.length ? "no" : unknown.length ? "possible" : "likely";
  return { trialId: t.id, title: t.title, status, met, unmet, unknown };
}
