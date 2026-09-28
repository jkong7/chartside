import type { Chart } from "../types";
import type { MeasureResult } from "./quality";

export interface AgendaItem {
  key: string;
  priority: number;
  category: "urgent" | "results" | "follow_up" | "treatment" | "open_loop" | "gap" | "risk" | "new_patient";
  text: string;
  why: string;
  keywords: string[];
  addressed?: boolean;
}

export interface AgendaInput {
  chart: Chart | null | undefined;
  newPatient: boolean;
  intakeFlags?: { level: "info" | "warn" | "urgent"; text: string }[];
  quality?: MeasureResult[];
  openTasks?: { kind: string; title: string; dueAt: string | null }[];
  suspects?: { condition: string; suggestedCode: string; evidence: string }[];
  at?: Date;
}

const STOP = new Set(["the", "and", "for", "with", "your", "you", "in", "of", "to", "a", "an", "on", "at", "recheck", "check", "months", "month", "weeks", "week", "every", "log", "home", "referral", "order", "review", "result"]);

function words(s: string) {
  return Array.from(new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))));
}

const LAB_WORDS: Record<string, string[]> = {
  "hemoglobin a1c": ["a1c", "sugar", "diabetes"],
  ldl: ["ldl", "cholesterol", "statin"],
  egfr: ["kidney", "egfr", "creatinine"],
  tsh: ["thyroid", "tsh", "levothyroxine"],
};

export function buildAgenda(x: AgendaInput): AgendaItem[] {
  const out: AgendaItem[] = [];
  const add = (i: AgendaItem) => {
    if (!out.some((o) => o.key === i.key)) out.push(i);
  };
  for (const f of x.intakeFlags ?? []) {
    if (f.level === "info") continue;
    add({ key: `intake:${f.text}`, priority: f.level === "urgent" ? 100 : 75, category: f.level === "urgent" ? "urgent" : "follow_up", text: f.text, why: "Reported on the pre-visit questionnaire", keywords: words(f.text).slice(0, 4) });
  }
  const onc = x.chart?.oncology;
  if (onc) {
    const cur = onc.regimens.find((r) => !r.end);
    const worst = [...(onc.toxicityHistory ?? [])].filter((t) => t.cycle === Math.max(...(onc.toxicityHistory ?? []).map((y) => y.cycle ?? 0))).sort((a, b) => b.grade - a.grade)[0];
    if (cur) add({ key: "onc:cycle", priority: 85, category: "treatment", text: `${cur.name} cycle ${(cur.cycles ?? 0) + 1}: decide to treat, hold, or dose reduce`, why: worst ? `Last cycle: grade ${worst.grade} ${worst.term.toLowerCase()}` : "On active treatment", keywords: ["cycle", "treatment", "proceed", "hold", cur.name.toLowerCase()] });
    if (worst && worst.grade >= 2) add({ key: "onc:tox", priority: 82, category: "treatment", text: `Reassess ${worst.term.toLowerCase()} (grade ${worst.grade} last cycle)`, why: "CTCAE grade 2 or higher on the prior cycle", keywords: words(worst.term) });
  }
  for (const l of x.chart?.labs ?? []) {
    if (l.flag !== "high" && l.flag !== "low") continue;
    const kw = LAB_WORDS[l.name.toLowerCase()] ?? words(l.name);
    add({ key: `lab:${l.name}`, priority: 80, category: "results", text: `Review ${l.name} ${l.value} (${l.flag}, ${l.date})`, why: "Abnormal result since the last visit", keywords: kw });
  }
  const last = x.chart?.priorVisits?.[0];
  for (const p of last?.plan ?? []) add({ key: `plan:${p}`, priority: 70, category: "follow_up", text: `Close the loop: ${p}`, why: `Plan from the ${last!.date} visit`, keywords: words(p).slice(0, 3) });
  const at = x.at ?? new Date();
  for (const t of x.openTasks ?? []) {
    const overdue = t.dueAt && new Date(t.dueAt) < at;
    add({ key: `task:${t.title}`, priority: overdue ? 65 : 55, category: "open_loop", text: t.title, why: overdue ? "Open task, overdue" : "Open task", keywords: words(t.title).slice(0, 3) });
  }
  for (const q of x.quality ?? []) {
    if (q.status !== "gap") continue;
    add({ key: `gap:${q.id}`, priority: 50, category: "gap", text: q.title, why: `${q.ecqm}: ${q.reason}`, keywords: words(q.title).slice(0, 3) });
  }
  for (const s of x.suspects ?? []) add({ key: `hcc:${s.suggestedCode}`, priority: 45, category: "risk", text: `Assess for ${s.condition.toLowerCase()} (${s.suggestedCode})`, why: s.evidence, keywords: words(s.condition) });
  if (x.newPatient) {
    add({ key: "new:history", priority: 60, category: "new_patient", text: "Confirm past medical, surgical, family, and social history", why: "New patient", keywords: ["surgery", "surgeries", "family", "smoke", "alcohol", "history"] });
    add({ key: "new:meds", priority: 60, category: "new_patient", text: "Reconcile medications and allergies", why: "New patient", keywords: ["medications", "allergies", "allergic", "taking"] });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

export function markAddressed(items: AgendaItem[], transcript: string, done: string[] = []) {
  const t = transcript.toLowerCase();
  return items.map((i) => ({ ...i, addressed: done.includes(i.key) || (i.keywords.length > 0 && i.keywords.some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(t))) }));
}
