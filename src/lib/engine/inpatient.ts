import type { Chart, Note, NoteSection, NoteSentence, StagedOrder } from "../types";
import type { Facts } from "./extract";

export interface Snapshot {
  date: string;
  vitals: Record<string, { value: string; evidence: string[] }>;
  results: Record<string, { value: string; abnormal: boolean; evidence: string[] }>;
  meds: { name: string; action: string; dose?: string; frequency?: string; evidence: string[] }[];
  problems: { key: string; label: string; icd10: string; status: string | null }[];
}

export function snapshotFrom(facts: Facts, at: Date): Snapshot {
  const vitals: Snapshot["vitals"] = {};
  for (const v of facts.vitals) vitals[v.name] = { value: v.value, evidence: v.evidence };
  const results: Snapshot["results"] = {};
  for (const r of facts.results) results[r.name] = { value: r.value, abnormal: r.abnormal, evidence: r.evidence };
  return {
    date: at.toISOString(),
    vitals,
    results,
    meds: facts.meds.filter((m) => !m.cancelled && ["start", "stop", "increase", "decrease", "change", "continue"].includes(m.action)).map((m) => ({ name: m.name, action: m.action, dose: m.dose, frequency: m.frequency, evidence: m.evidence })),
    problems: facts.problems.filter((p) => !p.fromSymptom).map((p) => ({ key: p.key, label: p.label, icd10: p.icd10, status: p.status ?? null })),
  };
}

const num = (v: string) => Number.parseFloat(v);
const unit = (v: string) => v.replace(/^[\d.\s/]+/, "").trim();

function sentence(id: string, text: string, evidence: string[], kind: NoteSentence["kind"] = "fact"): NoteSentence {
  return { id, text, evidence, kind, support: "strong" };
}

export function intervalChanges(prev: Snapshot | null, cur: Snapshot): NoteSentence[] {
  const out: NoteSentence[] = [];
  let n = 0;
  const id = () => `interval_${++n}`;
  const w = cur.vitals.Weight;
  if (w) {
    const pw = prev?.vitals.Weight;
    if (pw && unit(pw.value) === unit(w.value)) {
      const d = Math.round((num(w.value) - num(pw.value)) * 10) / 10;
      out.push(sentence(id(), `Weight ${w.value}, ${d === 0 ? "unchanged" : `${d < 0 ? "down" : "up"} ${Math.abs(d)} ${unit(w.value)}`} from ${pw.value} yesterday.`, w.evidence));
    } else out.push(sentence(id(), `Weight ${w.value}.`, w.evidence));
  }
  const vit = ["BP", "HR", "SpO2", "Temp", "RR"].filter((k) => cur.vitals[k]);
  if (vit.length) out.push(sentence(id(), `Vitals: ${vit.map((k) => `${k === "SpO2" ? "SpO2" : k} ${cur.vitals[k].value}${prev?.vitals[k] && prev.vitals[k].value !== cur.vitals[k].value ? ` (was ${prev.vitals[k].value})` : ""}`).join(", ")}.`, vit.flatMap((k) => cur.vitals[k].evidence)));
  const labs = Object.entries(cur.results);
  if (labs.length) {
    const parts = labs.map(([name, r]) => {
      const p = prev?.results[name];
      if (!p) return `${name} ${r.value} (new)`;
      const d = num(r.value) - num(p.value);
      const trend = Math.abs(d) < 1e-9 ? "stable" : d > 0 ? "up" : "down";
      return `${name} ${r.value} (${trend} from ${p.value.replace(` ${unit(p.value)}`, "")})`;
    });
    out.push(sentence(id(), `Labs: ${parts.join(", ")}.`, labs.flatMap(([, r]) => r.evidence)));
  }
  const changed = cur.meds.filter((m) => m.action !== "continue");
  if (changed.length) {
    const verb: Record<string, string> = { start: "Started", stop: "Stopped", increase: "Increased", decrease: "Decreased", change: "Changed" };
    out.push(sentence(id(), `Medication changes today: ${changed.map((m) => `${verb[m.action] ?? m.action} ${m.name}${m.dose ? ` ${m.dose}` : ""}${m.frequency ? ` ${m.frequency}` : ""}`).join("; ")}.`, changed.flatMap((m) => m.evidence)));
  }
  if (prev) {
    const resolved = prev.problems.filter((p) => !cur.problems.some((c) => c.key === p.key));
    const statusChanged = cur.problems.filter((c) => c.status && prev.problems.find((p) => p.key === c.key)?.status !== c.status);
    for (const c of statusChanged) out.push(sentence(id(), `${c.label}: ${c.status}.`, []));
    if (resolved.length) out.push(sentence(id(), `Not addressed today: ${resolved.map((p) => p.label).join(", ")}.`, [], "system"));
  }
  if (!out.length) out.push(sentence(id(), "No new vitals, labs, or medication changes were discussed today.", [], "system"));
  return out;
}

export function carryForward(prevNote: Note | null, facts: Facts): NoteSentence[] {
  if (!prevNote) return [];
  const ap = prevNote.sections.find((s) => /assessment|plan|ap/.test(s.key));
  if (!ap) return [];
  const todays = new Set(facts.problems.map((p) => p.icd10.slice(0, 3)));
  const out: NoteSentence[] = [];
  let current: NoteSentence | null = null;
  let keep = false;
  for (const s of ap.sentences.filter((x) => !x.pending)) {
    if (s.heading) {
      const code = /\(([A-Z]\d{2})[\d.A-Z]*\)/.exec(s.text)?.[1];
      keep = !!code && !todays.has(code);
      current = s;
      if (keep) out.push({ ...s, id: `cf_${s.id}`, kind: "carried", pending: true, support: "strong", evidence: [] });
    } else if (keep && current && s.indent) {
      out.push({ ...s, id: `cf_${s.id}`, kind: "carried", pending: true, support: "strong", evidence: [] });
    }
  }
  return out;
}

export interface CourseDay {
  day: number;
  date: string;
  note: Note;
  snapshot: Snapshot | null;
  kind: "admission" | "progress" | "discharge";
}

export function hospitalCourse(days: CourseDay[]) {
  const byProblem = new Map<string, { label: string; items: string[] }>();
  for (const d of days) {
    const ap = d.note.sections.find((s) => /assessment|plan|ap/.test(s.key));
    if (!ap) continue;
    let heading: string | null = null;
    let items: string[] = [];
    const flush = () => {
      if (!heading) return;
      const label = heading.replace(/^\d+\.\s*/, "").replace(/\s*\([A-Z]\d[\d.A-Z]*\).*$/, "").trim();
      const key = /\(([A-Z]\d{2})/.exec(heading)?.[1] ?? label.toLowerCase();
      const entry = byProblem.get(key) ?? { label, items: [] };
      if (items.length) entry.items.push(`Day ${d.day}: ${items.map((x) => x.replace(/\.$/, "")).join("; ")}.`);
      entry.label = label;
      byProblem.set(key, entry);
    };
    for (const s of ap.sentences.filter((x) => !x.pending)) {
      if (s.heading) {
        flush();
        heading = s.text;
        items = [];
      } else if (heading && s.indent) items.push(s.text);
    }
    flush();
  }
  const weights = days.map((d) => d.snapshot?.vitals.Weight?.value).filter(Boolean) as string[];
  return { problems: [...byProblem.values()].filter((p) => p.items.length), weightTrend: weights.length >= 2 ? `${weights[0]} on admission to ${weights.at(-1)} at discharge` : null };
}

export interface MedRecLine {
  name: string;
  status: "continue" | "new" | "changed" | "stopped";
  detail: string;
}

export function dischargeMedRec(homeMeds: Chart["medications"], stay: Snapshot[], discharge: Facts | null): MedRecLine[] {
  const final = new Map<string, { action: string; dose?: string; frequency?: string }>();
  for (const s of stay) for (const m of s.meds) final.set(m.name, { action: m.action, dose: m.dose, frequency: m.frequency });
  for (const m of discharge?.meds ?? []) if (!m.cancelled) final.set(m.name, { action: m.action, dose: m.dose, frequency: m.frequency });
  const out: MedRecLine[] = [];
  const base = (n: string) => n.toLowerCase().split(" ")[0];
  for (const h of homeMeds) {
    const f = [...final.entries()].find(([n]) => base(n) === base(h.name))?.[1];
    const home = [h.dose, h.frequency].filter(Boolean).join(" ");
    if (!f || f.action === "continue" || f.action === "taking") out.push({ name: h.name, status: "continue", detail: f?.dose ? [f.dose, f.frequency].filter(Boolean).join(" ") : home });
    else if (f.action === "stop") out.push({ name: h.name, status: "stopped", detail: `Stopped (was ${home})` });
    else {
      const now = [f.dose, f.frequency].filter(Boolean).join(" ");
      if (!now || now === home) out.push({ name: h.name, status: "continue", detail: home });
      else out.push({ name: h.name, status: "changed", detail: `${now} (was ${home})` });
    }
  }
  for (const [n, f] of final) {
    if (homeMeds.some((h) => base(h.name) === base(n))) continue;
    if (f.action === "stop") continue;
    out.push({ name: n, status: "new", detail: [f.dose, f.frequency].filter(Boolean).join(" ") || "see instructions" });
  }
  return out;
}

export function pendingResults(orders: { order: StagedOrder; day: number }[], resulted: Set<string>) {
  return orders.filter(({ order }) => order.status !== "rejected" && (order.kind === "lab" || order.kind === "imaging") && !resulted.has(order.name.toLowerCase().split(" ")[0])).map(({ order, day }) => `${order.name} (ordered hospital day ${day})`);
}

export function dischargeSections(input: {
  admitDate: string;
  dischargeDate: string;
  reason: string;
  diagnoses: { label: string; icd10: string }[];
  course: ReturnType<typeof hospitalCourse>;
  procedures: string[];
  medRec: MedRecLine[];
  pending: string[];
  followUp: string[];
  instructions: string[];
  condition: string | null;
  evidence: Record<string, string[]>;
}): NoteSection[] {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const a = new Date(input.admitDate);
  const b = new Date(input.dischargeDate);
  const los = Math.max(1, Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000));
  let n = 0;
  const s = (text: string, evidence: string[] = [], extra: Partial<NoteSentence> = {}): NoteSentence => ({ id: `dc_${++n}`, text, evidence, kind: evidence.length ? "fact" : "system", support: "strong", ...extra });
  const label: Record<MedRecLine["status"], string> = { continue: "Continue", new: "New", changed: "Changed", stopped: "Stop" };
  return [
    { key: "dc_dates", title: "Admission", format: "bullets", sentences: [s(`Admitted ${fmt(input.admitDate)}; discharged ${fmt(input.dischargeDate)} (length of stay ${los} day${los > 1 ? "s" : ""}).`), s(`Reason for admission: ${input.reason}.`)] },
    { key: "dc_dx", title: "Discharge Diagnoses", format: "bullets", sentences: input.diagnoses.map((d, i) => s(`${i + 1}. ${d.label} (${d.icd10})`, [], { heading: true })) },
    { key: "dc_course", title: "Hospital Course", format: "bullets", sentences: [...input.course.problems.flatMap((p) => [s(p.label, [], { heading: true }), ...p.items.map((x) => s(x, [], { indent: 1 }))]), ...(input.course.weightTrend ? [s(`Weight ${input.course.weightTrend}.`)] : [])] },
    { key: "dc_procedures", title: "Procedures and Imaging", format: "bullets", sentences: input.procedures.length ? input.procedures.map((p) => s(p)) : [s("None.")] },
    { key: "dc_meds", title: "Discharge Medications", format: "bullets", sentences: input.medRec.map((m) => s(`${label[m.status]}: ${m.name} ${m.detail}`.trim(), input.evidence[m.name] ?? [])) },
    { key: "dc_pending", title: "Results Pending at Discharge", format: "bullets", sentences: input.pending.length ? input.pending.map((p) => s(p)) : [s("None.")] },
    { key: "dc_followup", title: "Follow-up", format: "bullets", sentences: input.followUp.length ? input.followUp.map((f) => s(f, input.evidence[f] ?? [])) : [s("Follow up with primary care within 7 days.")] },
    { key: "dc_instructions", title: "Discharge Instructions", format: "bullets", sentences: [...input.instructions.map((x) => s(x, input.evidence[x] ?? [])), ...(input.condition ? [s(`Condition at discharge: ${input.condition}.`)] : [])] },
  ];
}
