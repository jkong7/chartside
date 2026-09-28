import type { NoteSentence, Utterance } from "../types";
import { wordToNumber } from "./text";

export type Discipline = "PT" | "OT" | "SLP";

export const DISCIPLINE_MODIFIER: Record<Discipline, string> = { PT: "GP", OT: "GO", SLP: "GN" };

export interface TherapyService {
  cpt: string;
  label: string;
  timed: boolean;
  bundled?: boolean;
  re: RegExp;
}

export const SERVICES: TherapyService[] = [
  { cpt: "97110", label: "Therapeutic exercise", timed: true, re: /\btherapeutic exercises?\b|\bther[- ]?ex\b|\bstrengthening exercises?\b|\bstretching (?:exercises?|program)\b|\brange of motion exercises?\b/i },
  { cpt: "97112", label: "Neuromuscular re-education", timed: true, re: /\bneuromuscular re-?education\b|\bbalance training\b|\bproprioceptive training\b/i },
  { cpt: "97116", label: "Gait training", timed: true, re: /\bgait training\b/i },
  { cpt: "97140", label: "Manual therapy", timed: true, re: /\bmanual therapy\b|\bsoft tissue mobilization\b|\bjoint mobilizations?\b|\bmyofascial release\b/i },
  { cpt: "97530", label: "Therapeutic activities", timed: true, re: /\btherapeutic activit(?:y|ies)\b|\bfunctional (?:activities|training)\b/i },
  { cpt: "97535", label: "Self-care and home management training", timed: true, re: /\bself[- ]care training\b|\bADL training\b|\bhome management training\b/i },
  { cpt: "97035", label: "Ultrasound", timed: true, re: /\bultrasound (?:therapy|treatment)\b|\btherapeutic ultrasound\b/i },
  { cpt: "97014", label: "Electrical stimulation, unattended", timed: false, re: /\be-?stim\b|\belectrical stimulation\b|\bTENS\b/i },
  { cpt: "97010", label: "Hot or cold packs", timed: false, bundled: true, re: /\b(?:hot|cold|ice) packs?\b|\bmoist heat\b/i },
];

export const EVALS: Record<Discipline, { low: string; moderate: string; high: string; re: string }> = {
  PT: { low: "97161", moderate: "97162", high: "97163", re: "97164" },
  OT: { low: "97165", moderate: "97166", high: "97167", re: "97168" },
  SLP: { low: "92521", moderate: "92522", high: "92523", re: "92524" },
};

export interface ServiceLine {
  cpt: string;
  label: string;
  minutes: number | null;
  timed: boolean;
  bundled: boolean;
  evidence: string[];
}

export interface Measure {
  text: string;
  evidence: string[];
}

export interface TherapyFacts {
  services: ServiceLine[];
  measures: Measure[];
  evaluation: { kind: "initial" | "re"; complexity: "low" | "moderate" | "high"; basis: string } | null;
}

const MIN_RE = /\b(\d{1,2}|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|twenty[- ]five|thirty)\s*(?:more\s+)?min(?:ute)?s?\b/i;

function minutesIn(text: string) {
  const m = MIN_RE.exec(text);
  if (!m) return null;
  const raw = m[1].toLowerCase().replace(/[- ]/g, "");
  const words: Record<string, number> = { twentyfive: 25 };
  return words[raw] ?? (Number.isNaN(Number(raw)) ? wordToNumber(raw) : Number(raw));
}

export function extractTherapy(utts: Utterance[], ctx: { comorbidities: number; evaluation?: "initial" | "re" | null } = { comorbidities: 0 }): TherapyFacts {
  const services: ServiceLine[] = [];
  for (const u of utts) {
    if (u.speaker !== "clinician") continue;
    for (const clause of u.text.split(/(?<=[.;])\s+|,\s+(?:then|and then|plus)\s+/i)) {
      for (const s of SERVICES) {
        if (!s.re.test(clause) || /\b(?:next (?:time|visit|session)|at home|home program|HEP)\b/i.test(clause)) continue;
        const mins = s.timed ? minutesIn(clause) : null;
        const cur = services.find((x) => x.cpt === s.cpt);
        if (cur) {
          if (mins !== null) cur.minutes = (cur.minutes ?? 0) + mins;
          if (!cur.evidence.includes(u.id)) cur.evidence.push(u.id);
        } else services.push({ cpt: s.cpt, label: s.label, minutes: mins, timed: s.timed, bundled: !!s.bundled, evidence: [u.id] });
      }
    }
  }
  const measures: Measure[] = [];
  const MEAS: RegExp[] = [
    /\b(?:(?:shoulder|knee|hip|elbow|ankle|wrist|cervical|lumbar)\s+)?(?:flexion|extension|abduction|rotation|dorsiflexion)\b[^.,;]*?\b\d{1,3}\s*degrees\b/gi,
    /\b(?:strength|quad(?:ricep)?s?|hamstrings?|grip)\b[^.,;]*?\b[0-5](?:\+|-)?\s*(?:out of|\/)\s*5\b/gi,
    /\bpain\b[^.,;]*?\b\d{1,2}\s*(?:out of|\/)\s*10\b/gi,
    /\b(?:timed up and go|TUG)\b[^.,;]*?\b\d{1,3}(?:\.\d)?\s*seconds\b/gi,
    /\b(?:Berg|Oswestry|LEFS|DASH|QuickDASH)\b[^.,;]*?\b\d{1,3}\b/gi,
  ];
  for (const u of utts) {
    for (const re of MEAS) {
      for (const m of u.text.matchAll(re)) {
        const t = m[0].replace(/\byour\b/gi, "").replace(/\s{2,}/g, " ").trim();
        if (!measures.some((x) => x.text.toLowerCase() === t.toLowerCase())) measures.push({ text: t.charAt(0).toUpperCase() + t.slice(1), evidence: [u.id] });
      }
    }
  }
  let evaluation: TherapyFacts["evaluation"] = null;
  if (ctx.evaluation) {
    const all = utts.map((u) => u.text).join(" ");
    const unstable = /\b(?:unstable|unpredictable|rapidly changing|fall(?:s|ing)? (?:at home|last week|twice))\b/i.test(all);
    const evolving = /\b(?:evolving|changing|getting worse|worsening)\b/i.test(all);
    const complexity: "low" | "moderate" | "high" = unstable || ctx.comorbidities >= 3 ? "high" : evolving || ctx.comorbidities >= 1 ? "moderate" : "low";
    evaluation = { kind: ctx.evaluation, complexity, basis: `${ctx.comorbidities} comorbidit${ctx.comorbidities === 1 ? "y" : "ies"} affecting the plan of care; ${unstable ? "unstable" : evolving ? "evolving" : "stable"} clinical presentation` };
  }
  return { services, measures, evaluation };
}

export function unitsFor(services: ServiceLine[], method: "cms" | "per_code") {
  const timed = services.filter((s) => s.timed && (s.minutes ?? 0) > 0);
  const out = new Map<string, number>();
  if (method === "per_code") {
    for (const s of timed) out.set(s.cpt, s.minutes! < 8 ? 0 : Math.floor((s.minutes! - 8) / 15) + 1);
  } else {
    const total = timed.reduce((n, s) => n + s.minutes!, 0);
    const units = total < 8 ? 0 : Math.floor((total - 8) / 15) + 1;
    let left = units;
    for (const s of timed) {
      const full = Math.min(left, Math.floor(s.minutes! / 15));
      out.set(s.cpt, full);
      left -= full;
    }
    const rest = [...timed].sort((a, b) => (b.minutes! % 15) - (a.minutes! % 15) || b.minutes! - a.minutes!);
    for (const s of rest) {
      if (left <= 0) break;
      if (s.minutes! % 15 === 0 && out.get(s.cpt)! > 0) continue;
      out.set(s.cpt, out.get(s.cpt)! + 1);
      left--;
    }
  }
  for (const s of services.filter((x) => !x.timed && !x.bundled)) out.set(s.cpt, 1);
  return out;
}

export function totalTimed(services: ServiceLine[]) {
  return services.filter((s) => s.timed).reduce((n, s) => n + (s.minutes ?? 0), 0);
}

export function serviceSentences(f: TherapyFacts, key: string): NoteSentence[] {
  const out: NoteSentence[] = f.services.map((s, i) => ({
    id: `${key}_${i + 1}`,
    text: `${s.label} (${s.cpt}): ${s.bundled ? "provided (bundled, not separately billable)" : !s.timed ? "provided (untimed)" : s.minutes !== null ? `${s.minutes} minutes` : "*** minutes"}.`,
    evidence: s.evidence,
    kind: "fact",
    support: s.minutes !== null || !s.timed ? "strong" : "partial",
  }));
  if (!out.length) return [{ id: `${key}_1`, text: "Interventions and minutes: ***", evidence: [], kind: "system", support: "none" }];
  const t = totalTimed(f.services);
  const cms = unitsFor(f.services, "cms");
  const units = [...cms.entries()].filter(([cpt, n]) => n > 0 && f.services.find((s) => s.cpt === cpt)?.timed);
  out.push({ id: `${key}_${out.length + 1}`, text: `Total timed treatment: ${t} minutes, ${units.reduce((n, [, u]) => n + u, 0)} timed unit${units.reduce((n, [, u]) => n + u, 0) === 1 ? "" : "s"} under the 8-minute rule${units.length ? ` (${units.map(([cpt, u]) => `${cpt} x${u}`).join(", ")})` : ""}.`, evidence: [], kind: "system", support: "strong" });
  return out;
}

export function measureSentences(f: TherapyFacts, key: string): NoteSentence[] {
  if (!f.measures.length) return [{ id: `${key}_1`, text: "Objective measures: ***", evidence: [], kind: "system", support: "none" }];
  return f.measures.map((m, i) => ({ id: `${key}_${i + 1}`, text: `${m.text}.`, evidence: m.evidence, kind: "fact", support: "strong" }));
}
