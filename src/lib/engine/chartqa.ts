import type { Chart } from "../types";

export interface ChartDoc {
  id: string;
  source: "problem" | "medication" | "allergy" | "lab" | "screening" | "immunization" | "visit" | "note" | "record";
  title: string;
  text: string;
  date: string | null;
  link?: string;
}

export interface ChartAnswer {
  answer: string;
  citations: { id: string; source: ChartDoc["source"]; title: string; date: string | null; link?: string }[];
  mode: "structured" | "search" | "none";
}

export interface CorpusInput {
  chart: Chart;
  notes: { encounterId: string; date: string; title: string; lines: string[] }[];
  records: { id: string; name: string; date: string; text: string }[];
}

const SYN: [RegExp, string[]][] = [
  [/\bcolonoscop\w*|\bcolon cancer screen\w*|\bcolorectal\b|\bFIT\b|\bcologuard\b/i, ["colonoscopy", "fit", "cologuard", "colorectal", "stool"]],
  [/\bmammo\w*|\bbreast (?:cancer )?screen\w*/i, ["mammogram", "mammography", "breast"]],
  [/\ba1c\b|\bhemoglobin a1c\b|\bsugars?\b|\bglucose control\b/i, ["a1c", "hemoglobin a1c"]],
  [/\bldl\b|\bcholesterol\b|\blipids?\b/i, ["ldl", "cholesterol", "lipid"]],
  [/\begfr\b|\bkidney function\b|\bcreatinine\b/i, ["egfr", "creatinine", "kidney"]],
  [/\bflu\b|\binfluenza\b/i, ["influenza", "flu"]],
  [/\btetanus\b|\btdap\b|\btd\b/i, ["tdap", "tetanus", "td"]],
  [/\bpneumo\w*|\bprevnar\b|\bpcv\d*/i, ["pneumococcal", "pneumo", "prevnar", "pcv"]],
  [/\bshingles\b|\bzoster\b|\bshingrix\b/i, ["zoster", "shingrix", "shingles"]],
  [/\beye exam\b|\bretinal\b|\bophthalm\w*/i, ["eye", "retinal", "ophthalmology", "diabetic eye"]],
  [/\bphq\b|\bdepression screen\w*/i, ["phq-9", "phq", "depression"]],
  [/\bbone density\b|\bdexa\b|\bdxa\b/i, ["dexa", "bone density", "dxa"]],
  [/\bpap\b|\bcervical\b/i, ["pap", "cervical", "hpv"]],
  [/\bpsa\b|\bprostate\b/i, ["psa", "prostate"]],
  [/\btsh\b|\bthyroid\b/i, ["tsh", "thyroid"]],
  [/\bblood pressure\b|\bbp\b/i, ["bp", "blood pressure"]],
];

const STOP = new Set("a an the of for in on to and or is are was were what when how does do did her his their my we with at be by as it this that which who last most recent latest date ever has have had patient any".split(" "));

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []).filter((t) => !STOP.has(t) && t.length > 1);

export function buildCorpus(x: CorpusInput): ChartDoc[] {
  const docs: ChartDoc[] = [];
  const c = x.chart;
  c.problems.forEach((p, i) => docs.push({ id: `prob${i}`, source: "problem", title: p.name, text: `${p.name} ${p.icd10 ?? ""} ${p.since ? `since ${p.since}` : ""}`, date: null }));
  c.medications.forEach((m, i) => docs.push({ id: `med${i}`, source: "medication", title: m.name, text: [m.name, m.dose, m.frequency].filter(Boolean).join(" "), date: null }));
  c.allergies.forEach((a, i) => docs.push({ id: `alg${i}`, source: "allergy", title: a.substance, text: `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`, date: null }));
  (c.labs ?? []).forEach((l, i) => docs.push({ id: `lab${i}`, source: "lab", title: l.name, text: `${l.name} ${l.value}${l.flag && l.flag !== "normal" ? ` (${l.flag})` : ""}`, date: l.date }));
  (c.screenings ?? []).forEach((s, i) => docs.push({ id: `scr${i}`, source: "screening", title: s.name, text: `${s.name}${s.result ? `: ${s.result}` : ""}`, date: s.date }));
  (c.immunizations ?? []).forEach((v, i) => docs.push({ id: `imm${i}`, source: "immunization", title: v.name, text: v.name, date: v.date }));
  (c.priorVisits ?? []).forEach((v, i) => docs.push({ id: `pv${i}`, source: "visit", title: `Visit ${v.date}`, text: `${v.summary} Plan: ${v.plan.join("; ")}`, date: v.date }));
  for (const n of x.notes) n.lines.forEach((l, i) => docs.push({ id: `${n.encounterId}:${i}`, source: "note", title: n.title, text: l, date: n.date.slice(0, 10), link: `/encounters/${n.encounterId}` }));
  for (const r of x.records) r.text.split(/\n+|(?<=[.])\s+/).map((s) => s.trim()).filter((s) => s.length > 12).slice(0, 200).forEach((s, i) => docs.push({ id: `${r.id}:${i}`, source: "record", title: r.name, text: s, date: r.date.slice(0, 10) }));
  return docs;
}

const cite = (d: ChartDoc) => ({ id: d.id, source: d.source, title: d.title, date: d.date, link: d.link });
const fmt = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "undated");

function topic(q: string) {
  return SYN.find(([re]) => re.test(q))?.[1] ?? null;
}

function matches(d: ChartDoc, keys: string[]) {
  const t = `${d.title} ${d.text}`.toLowerCase();
  return keys.some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
}

export function answerChart(question: string, docs: ChartDoc[]): ChartAnswer {
  const q = question.trim();
  if (/\ballerg/i.test(q)) {
    const a = docs.filter((d) => d.source === "allergy");
    return { answer: a.length ? `Allergies on file: ${a.map((d) => d.text).join("; ")}.` : "No drug allergies are on file.", citations: a.map(cite), mode: "structured" };
  }
  if (/\b(?:current )?(?:med(?:ication)?s|taking|prescriptions?)\b/i.test(q) && !topic(q)) {
    const m = docs.filter((d) => d.source === "medication");
    const changes = docs.filter((d) => d.source === "note" && /^(?:Start|Stop|Increase|Decrease|Change|Continue|Refill)\b/.test(d.text)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 4);
    return { answer: `${m.length ? `Medications on file: ${m.map((d) => d.text).join("; ")}.` : "No medications are on file."}${changes.length ? ` Recent changes: ${changes.map((d) => `${d.text.replace(/\.$/, "")} (${fmt(d.date)})`).join("; ")}.` : ""}`, citations: [...m, ...changes].map(cite), mode: "structured" };
  }
  if (/\b(?:problems?|diagnos[ie]s|conditions?|medical history)\b/i.test(q) && !topic(q)) {
    const p = docs.filter((d) => d.source === "problem");
    return { answer: p.length ? `Problem list: ${p.map((d) => d.title).join("; ")}.` : "The problem list is empty.", citations: p.map(cite), mode: "structured" };
  }
  const keys = topic(q);
  if (keys) {
    const hits = docs.filter((d) => d.source !== "problem" && d.source !== "medication" && matches(d, keys));
    const dated = hits.filter((d) => d.date).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    if (/\b(?:trend|over time|history of|values|how has|been)\b/i.test(q)) {
      const series = dated.map((d) => ({ d, v: /(\d+(?:\.\d+)?)\s*(%|mg\/dL|mL\/min)/.exec(d.text) })).filter((x) => x.v).reverse();
      if (series.length) return { answer: `${keys[0].toUpperCase() === keys[0] ? keys[0] : keys[0].charAt(0).toUpperCase() + keys[0].slice(1)} over time: ${series.map((x) => `${x.v![1]}${x.v![2] === "%" ? "%" : ` ${x.v![2]}`} (${fmt(x.d.date)})`).join(", ")}.`, citations: series.map((x) => cite(x.d)), mode: "structured" };
    }
    if (dated.length) {
      const top = dated[0];
      const also = dated.slice(1, 3);
      return { answer: `Most recent: ${top.text.replace(/\.$/, "")} on ${fmt(top.date)}${top.source === "record" ? " (outside record)" : ""}.${also.length ? ` Earlier: ${also.map((d) => `${fmt(d.date)}`).join(", ")}.` : ""}`, citations: [top, ...also].map(cite), mode: "structured" };
    }
    if (hits.length) return { answer: `Mentioned in the chart but undated: ${hits[0].text}.`, citations: [cite(hits[0])], mode: "structured" };
    return { answer: `Nothing about ${keys[0]} is in this patient's chart, prior notes, or outside records.`, citations: [], mode: "none" };
  }
  const qt = words(q);
  if (!qt.length) return { answer: "Ask about a result, screening, vaccine, medication, or anything said at a prior visit.", citations: [], mode: "none" };
  const N = docs.length;
  const df = (t: string) => docs.filter((d) => words(`${d.title} ${d.text}`).includes(t)).length || 1;
  const scored = docs.map((d) => {
    const w = words(`${d.title} ${d.text}`);
    const s = qt.reduce((n, t) => n + (w.includes(t) ? Math.log(1 + N / df(t)) : 0), 0);
    return { d, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (b.d.date ?? "").localeCompare(a.d.date ?? "")).slice(0, 3);
  if (!scored.length) return { answer: "Nothing in this patient's chart, prior notes, or outside records matches that question.", citations: [], mode: "none" };
  return { answer: scored.map((x) => `${x.d.text.replace(/\.$/, "")} (${x.d.source === "note" ? `visit ${fmt(x.d.date)}` : x.d.source === "record" ? `outside record, ${fmt(x.d.date)}` : x.d.source}).`).join(" "), citations: scored.map((x) => cite(x.d)), mode: "search" };
}
