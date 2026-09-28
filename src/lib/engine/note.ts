import type { Encounter, Note, NoteSection, NoteSentence, Patient, SectionKind, Template, TemplateSection } from "../types";
import type { Facts, MedFact, ProblemFact, SymptomFact } from "./extract";
import { assessRisk, goalSentences, interventionSentences, psychotherapyCode, psychotherapyMinutes, responseSentences, riskSentences } from "./behavioral";
import { edCourse, edDisposition } from "./ed";
import { groupTopic } from "./group";
import { extractLesions, extractMsk, lesionSentences, mskSentences } from "./exam";
import { acpSentences, awvReview, awvSentences, scheduleSentences, screeningSchedule } from "./awv";
import { guidanceSentences, screenSentences, wellChild } from "./wellchild";
import { ageInMonths, dueLabel, immunizationGaps } from "./immunizations";
import { gdmtFor, gdmtSentences } from "./gdmt";
import { dueSentences, extractPrenatal, obExamSentences, prenatalDue, pregnancySentences, warningSentences } from "./prenatal";
import { extractProcedures, procedureSentences } from "./procedures";
import { EVALS, extractTherapy, measureSentences, serviceSentences } from "./therapy";
import { extractOncology, oncologyHistorySentences, toxicitySentences, treatmentSentences } from "./oncology";
import { NORMAL_EXAM, type RosSystem } from "./lexicon";
import { ageFrom, durationText, ensurePeriod, joinList, pronounsFor, sentenceCase, toThirdPerson, unique } from "./text";

export interface NoteContext {
  patient: Patient | null;
  encounter: Pick<Encounter, "reason" | "visitType" | "scheduledAt">;
  template: Template;
  utterances?: import("../types").Utterance[];
  minutes?: number;
  startedAt?: string | null;
}

const RESULT_PROBLEM: Record<string, string[]> = {
  "Hemoglobin A1c": ["t2dm", "prediabetes"],
  LDL: ["hld"],
  "Total cholesterol": ["hld"],
  eGFR: ["ckd", "t2dm"],
  Creatinine: ["ckd"],
  TSH: ["hypothyroid"],
  "Vitamin D": ["vitd"],
  Hemoglobin: ["ida"],
  Potassium: ["htn", "ckd"],
};

const MED_PROBLEM_CLASSES: Record<string, string[]> = {
  htn: ["ACE inhibitor", "ARB", "calcium channel blocker", "thiazide diuretic", "thiazide-like diuretic", "beta blocker"],
  t2dm: ["biguanide", "sulfonylurea", "SGLT2 inhibitor", "GLP-1 receptor agonist", "GIP/GLP-1 receptor agonist", "basal insulin"],
  hld: ["statin"],
  hypothyroid: ["thyroid hormone"],
  gerd: ["proton pump inhibitor", "H2 blocker"],
  asthma: ["short-acting bronchodilator", "ICS/LABA"],
  gad: ["SSRI"],
  mdd: ["SSRI", "NDRI"],
};

const ROS_ORDER: RosSystem[] = [
  "Constitutional", "Eyes", "ENT", "Cardiovascular", "Respiratory", "Gastrointestinal", "Genitourinary", "Musculoskeletal", "Skin", "Neurological", "Psychiatric", "Endocrine", "Hematologic",
];

const EXAM_ORDER = ["General", "HEENT", "Neck", "Cardiovascular", "Respiratory", "Abdomen", "Musculoskeletal", "Extremities", "Skin", "Neurological", "Psychiatric"];

class Builder {
  private n = 0;
  constructor(private key: string) {}
  s(text: string, evidence: string[], kind: NoteSentence["kind"] = "fact", extra: Partial<NoteSentence> = {}): NoteSentence {
    this.n += 1;
    return {
      id: `${this.key}_${this.n}`,
      text: ensurePeriod(sentenceCase(text.trim())),
      evidence: unique(evidence),
      kind,
      support: kind === "default" ? "none" : "strong",
      ...extra,
    };
  }
}

function sexWord(sex: string, age: number) {
  if (sex === "F") return age < 18 ? "girl" : "woman";
  if (sex === "M") return age < 18 ? "boy" : "man";
  return "patient";
}

function medLabel(m: { name: string; dose?: string; frequency?: string }) {
  return [m.name, m.dose, m.frequency].filter(Boolean).join(" ");
}

function symptomPhrase(f: SymptomFact) {
  const parts: string[] = [];
  const quality = f.quality && !f.label.includes(f.quality) ? (/^pressure$/i.test(f.quality) ? "pressure-like " : `${f.quality} `) : "";
  let loc = "";
  const locWords = (f.location ?? "").split(/\s+/).filter((x) => !/^(left|right|both|bilateral|side|sides)$/.test(x));
  const redundant = locWords.length > 0 && locWords.every((x) => f.label.includes(x.replace(/er$/, "")));
  if (f.location && !redundant && !f.label.includes(f.location.replace(/ side$/, ""))) {
    loc = f.key === "ear_pain" ? ` in the ${f.location.replace(/ ear$/, "")} ear` : ` (${f.location})`;
  }
  parts.push(`${quality}${f.label}${loc}`);
  if (f.duration) parts.push(`for ${durationText(f.duration)}`);
  else if (f.onset) parts.push(f.onset.startsWith("since") ? f.onset : `that ${f.onset}`);
  return parts.join(" ");
}

function hpiSentences(b: Builder, facts: Facts, ctx: NoteContext, verbosity: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  const p = ctx.patient;
  const age = p ? ageFrom(p.dob, new Date(ctx.encounter.scheduledAt)) : null;
  const pr = pronounsFor(p?.pronouns ?? "", p?.sex ?? "X");
  const child = age !== null && age < 18;
  const Subj = child ? "Parent" : sentenceCase(pr.subj);
  const reports = child ? "reports" : pr.subj === "they" ? "report" : "reports";
  const denies = child ? "denies" : pr.subj === "they" ? "deny" : "denies";
  const has = child ? "has" : pr.have;

  const history = (p?.chart.problems ?? []).slice(0, 4).map((x) => x.name.replace(/^Essential /, "").replace(/ mellitus$/, "").toLowerCase());
  const cc = facts.chiefComplaint;
  const ccFact = cc ? facts.symptoms.find((s) => s.key === cc.key) : undefined;
  const chronicAssessed = facts.problems.filter((x) => x.chronic && !x.fromSymptom);
  const isFollowUp = ctx.encounter.visitType === "follow-up" && chronicAssessed.length > 0;
  const reason = isFollowUp
    ? `follow-up of ${joinList(chronicAssessed.map((x) => shortLabel(x)))}`
    : ccFact
      ? `evaluation of ${symptomPhrase(ccFact)}`
      : ctx.encounter.reason
        ? ctx.encounter.reason.toLowerCase()
        : "a visit";
  const who = p ? `${p.name.split(" ")[0]} is a ${age}-year-old ${sexWord(p.sex, age ?? 30)}` : "Patient";
  const hx = history.length ? ` with a history of ${joinList(history)}` : "";
  out.push(b.s(`${who}${hx} who presents for ${reason}`, cc?.evidence ?? chronicAssessed[0]?.evidence.slice(0, 1) ?? []));
  const nonEnglish = facts.languages.filter((l) => l !== "en" && l !== "und");
  if (facts.interpreter && nonEnglish.length) out.push(b.s(`Visit conducted with an interpreter; patient's preferred language is ${nonEnglish.map((l) => ({ es: "Spanish", zh: "Mandarin", vi: "Vietnamese" } as Record<string, string>)[l] ?? l).join(", ")}`, [], "system"));
  if (child && facts.symptoms.length) out.push(b.s("History provided by parent", facts.symptoms.filter((x) => !x.negated).flatMap((x) => x.evidence).slice(0, 2)));

  const primary = isFollowUp && ccFact ? ccFact : ccFact && !isFollowUp ? ccFact : undefined;
  const described = new Set<string>();
  if (primary) {
    described.add(primary.key);
    const detail: string[] = [];
    if (primary.severity) detail.push(`rated ${primary.severity.includes("/10") ? primary.severity : primary.severity}`);
    if (primary.radiation) detail.push(`radiating to the ${primary.radiation.replace(/^(?:my|the|her|his) /, "")}`);
    if (primary.timing) detail.push(/^(at night|in the morning|in the evening)$/.test(primary.timing) ? `worse ${primary.timing}` : primary.timing === "all the time" ? "constant" : primary.timing);
    if (isFollowUp) {
      out.push(b.s(`${Subj} also ${reports} ${symptomPhrase(primary)}${detail.length ? `, ${joinList(detail)}` : ""}`, primary.evidence));
      described.add(primary.key);
    } else if (detail.length) {
      const noun = /pain|ache/.test(primary.label) ? "Pain" : sentenceCase(primary.label);
      out.push(b.s(`${noun} is ${joinList(detail)}`, primary.evidence));
    }
    if (primary.context) {
      if (/\b(kids?|son|daughter|husband|wife|coworkers?|family)\b/.test(primary.context)) out.push(b.s(`Sick contacts: ${primary.context.replace(/\btheir\b/, pr.poss)}`, primary.evidence));
      else out.push(b.s(`Onset was associated with ${primary.context}`, primary.evidence));
    }
    const mods: string[] = [];
    if (primary.aggravating?.length) mods.push(`worse with ${joinList(primary.aggravating)}`);
    if (primary.relieving?.length) mods.push(`improved with ${joinList(primary.relieving)}`);
    if (mods.length) out.push(b.s(`Symptoms are ${joinList(mods)}`, primary.evidence));
    if (primary.tried?.length && verbosity !== "concise") {
      const tried = primary.tried.filter((t) => !primary.relieving?.includes(t));
      if (tried.length) out.push(b.s(`${Subj} ${has} tried ${joinList(tried)}`, primary.evidence));
    }
  }

  const assoc = facts.symptoms.filter((s) => !s.negated && !described.has(s.key));
  if (assoc.length) {
    const ev = assoc.flatMap((s) => s.evidence);
    const text = assoc.map((s) => (s.duration && s !== primary ? `${s.label} (${durationText(s.duration)})` : s.label));
    out.push(b.s(primary || isFollowUp ? `${Subj} also ${reports} ${joinList(text)}` : `${Subj} ${reports} ${joinList(text)}`, ev));
  }

  if (isFollowUp) {
    for (const prob of chronicAssessed) {
      const bits: string[] = [];
      const ev: string[] = [];
      const res = facts.results.filter((r) => RESULT_PROBLEM[r.name]?.includes(prob.key));
      for (const r of res) {
        bits.push(`most recent ${r.name} ${r.value}`);
        ev.push(...r.evidence);
      }
      if (prob.key === "htn") {
        const home = facts.vitals.find((v) => v.name === "Home BP");
        if (home) {
          bits.push(`home readings ${home.value}`);
          ev.push(...home.evidence);
        }
      }
      const classes = MED_PROBLEM_CLASSES[prob.key] ?? [];
      const taking = facts.meds.filter((m) => classes.includes(m.cls) && ["taking", "side_effect", "not_taking"].includes(m.action));
      const byName = new Map<string, MedFact[]>();
      for (const m of taking) byName.set(m.name, [...(byName.get(m.name) ?? []), m]);
      for (const [name, ms] of byName) {
        const base = ms.find((m) => m.action === "taking") ?? ms[0];
        const issues = ms.filter((m) => m.action !== "taking" && m.note).map((m) => m.note!);
        bits.push(`taking ${medLabel({ name, dose: base.dose, frequency: base.frequency })}${issues.length ? ` (${issues.join("; ")})` : ""}`);
        ev.push(...ms.flatMap((m) => m.evidence));
      }
      if (bits.length) out.push(b.s(`${sentenceCase(shortLabel(prob))}: ${bits.join("; ")}`, ev));
    }
  }

  const negs = facts.symptoms.filter((s) => s.negated && s.key !== "si");
  if (negs.length) out.push(b.s(`${Subj} ${denies} ${joinList(negs.map((s) => s.label))}`, negs.flatMap((s) => s.evidence)));
  const si = facts.symptoms.find((s) => s.key === "si");
  if (si) out.push(b.s(si.negated ? `${Subj} ${denies} suicidal ideation` : `${Subj} ${reports} thoughts of self-harm; safety assessment documented below`, si.evidence));

  if (verbosity === "concise") {
    const keep = out.slice(0, 1).concat(out.slice(1).filter((s) => /denies|deny|rated|worse|: /.test(s.text) || out.indexOf(s) === 1));
    return keep.slice(0, 5);
  }
  return out;
}

function shortLabel(p: ProblemFact) {
  const map: Record<string, string> = {
    htn: "hypertension",
    t2dm: "type 2 diabetes",
    hld: "hyperlipidemia",
    ckd: "chronic kidney disease",
    gad: "generalized anxiety disorder",
    mdd: "depression",
    hypothyroid: "hypothyroidism",
    gerd: "GERD",
  };
  return map[p.key] ?? p.label.split(",")[0].toLowerCase();
}

function rosSentences(b: Builder, facts: Facts): NoteSentence[] {
  const bySystem = new Map<string, SymptomFact[]>();
  for (const s of facts.symptoms) bySystem.set(s.system, [...(bySystem.get(s.system) ?? []), s]);
  const out: NoteSentence[] = [];
  for (const sys of ROS_ORDER) {
    const xs = bySystem.get(sys);
    if (!xs?.length) continue;
    const pos = xs.filter((x) => !x.negated).map((x) => x.label);
    const neg = xs.filter((x) => x.negated).map((x) => x.label);
    const parts = [];
    if (pos.length) parts.push(`positive for ${joinList(pos)}`);
    if (neg.length) parts.push(`negative for ${joinList(neg, "or")}`);
    out.push(b.s(`${sys}: ${parts.join("; ")}`, xs.flatMap((x) => x.evidence)));
  }
  return out;
}

function medsSentences(b: Builder, facts: Facts, ctx: NoteContext): NoteSentence[] {
  const out: NoteSentence[] = [];
  const chartMeds = ctx.patient?.chart.medications ?? [];
  const seen = new Set<string>();
  for (const cm of chartMeds) {
    const key = cm.name.toLowerCase();
    const visit = facts.meds.filter((m) => key.includes(m.name.split(" ")[0]) || m.name.includes(key.split(" ")[0]));
    seen.add(visit[0]?.name ?? key);
    const change = visit.find((m) => ["increase", "decrease", "stop", "change"].includes(m.action) && !m.cancelled);
    const issue = visit.find((m) => (m.action === "side_effect" || m.action === "not_taking") && m.note);
    let text = medLabel(cm);
    if (change) {
      const verb = { increase: "increasing to", decrease: "decreasing to", stop: "discontinued", change: "changing to" }[change.action as "increase"];
      text += ` — ${verb}${change.action === "stop" ? "" : ` ${[change.note === "extended-release" ? "extended-release" : "", change.dose, change.frequency].filter(Boolean).join(" ")}`} today`;
    }
    if (issue) text += `; ${issue.note}`;
    out.push(b.s(text, visit.length ? visit.flatMap((m) => m.evidence) : ["chart"], visit.length ? "fact" : "carried"));
  }
  for (const m of facts.meds) {
    if (seen.has(m.name) || m.cancelled) continue;
    if (m.action === "taking" || m.action === "continue") {
      seen.add(m.name);
      out.push(b.s(`${medLabel(m)}${m.action === "taking" && !m.rx ? " (over the counter)" : ""}`, m.evidence));
    }
  }
  const newStarts = facts.meds.filter((m) => m.action === "start" && !m.cancelled && !seen.has(m.name));
  for (const m of newStarts) out.push(b.s(`${medLabel(m)} — new today`, m.evidence));
  if (!out.length) out.push(b.s("No current medications", []));
  return out;
}

function allergySentences(b: Builder, facts: Facts, ctx: NoteContext): NoteSentence[] {
  const out: NoteSentence[] = [];
  const chart = ctx.patient?.chart.allergies ?? [];
  const seen = new Set<string>();
  for (const a of facts.allergies) {
    seen.add(a.substance);
    out.push(b.s(`${sentenceCase(a.substance)}${a.reaction ? ` (${a.reaction})` : ""}`, a.evidence));
  }
  for (const a of chart) {
    if (seen.has(a.substance.toLowerCase())) continue;
    out.push(b.s(`${sentenceCase(a.substance)}${a.reaction ? ` (${a.reaction})` : ""}`, ["chart"], "carried"));
  }
  if (!out.length && facts.nkda) out.push(b.s("No known drug allergies", facts.nkda));
  if (!out.length) out.push(b.s("No known drug allergies on file", ["chart"], "carried"));
  return out;
}

function vitalsSentence(b: Builder, facts: Facts, ctx: NoteContext): NoteSentence[] {
  const visit = facts.vitals.filter((v) => v.name !== "Home BP");
  if (visit.length) return [b.s(visit.map((v) => `${v.name} ${v.value}`).join(", "), visit.flatMap((v) => v.evidence))];
  const chart = ctx.patient?.chart.vitals;
  if (chart && Object.keys(chart).length) {
    return [b.s(`Last recorded: ${Object.entries(chart).map(([k, v]) => `${k} ${v}`).join(", ")}`, ["chart"], "carried")];
  }
  return [];
}

function examSentences(b: Builder, facts: Facts, opts: { psychOnly?: boolean } = {}): NoteSentence[] {
  const out: NoteSentence[] = [];
  const bySystem = new Map<string, typeof facts.exam>();
  for (const e of facts.exam) bySystem.set(e.system, [...(bySystem.get(e.system) ?? []), e]);
  const order = opts.psychOnly ? ["General", "Psychiatric"] : EXAM_ORDER;
  for (const sys of order) {
    const xs = bySystem.get(sys);
    if (!xs?.length) continue;
    const text = xs.map((x) => sentenceCase(x.text).replace(/[.]$/, "")).join(". ");
    out.push(b.s(`${sys}: ${text}`, xs.flatMap((x) => x.evidence)));
  }
  const examined = new Set(bySystem.keys());
  const suggest = opts.psychOnly ? ["General"] : ["General", "Cardiovascular", "Respiratory"];
  for (const sys of suggest) {
    if (examined.has(sys) || !NORMAL_EXAM[sys]) continue;
    if (!facts.exam.length && sys !== "General") continue;
    out.push(b.s(`${sys}: ${NORMAL_EXAM[sys]}`, [], "default", { pending: true }));
  }
  return out;
}

function resultSentences(b: Builder, facts: Facts, ctx: NoteContext): NoteSentence[] {
  const out: NoteSentence[] = [];
  const seen = new Set<string>();
  for (const r of facts.results) {
    seen.add(r.name);
    out.push(b.s(`${r.name}: ${r.value}${r.abnormal ? " (abnormal)" : ""}`, r.evidence));
  }
  const at = new Date(ctx.encounter.scheduledAt).getTime();
  for (const l of ctx.patient?.chart.labs ?? []) {
    if (seen.has(l.name)) continue;
    const age = (at - new Date(l.date).getTime()) / 86400000;
    if (age > 120) continue;
    out.push(b.s(`${l.name}: ${l.value} (${l.date})${l.flag && l.flag !== "normal" ? ` — ${l.flag}` : ""}`, ["chart"], "carried"));
  }
  return out;
}

function apSentences(b: Builder, facts: Facts, verbosity: string, split?: "assessment" | "plan"): NoteSentence[] {
  const out: NoteSentence[] = [];
  const probs = facts.problems;
  probs.forEach((p, i) => {
    const status = p.status ? ` — ${p.status}` : "";
    if (split !== "plan") out.push(b.s(`${i + 1}. ${p.label} (${p.icd10})${status}`, p.evidence.slice(0, 3), "fact", { heading: true }));
    else out.push(b.s(`${p.label}`, p.evidence.slice(0, 1), "fact", { heading: true }));
    const order = { reasoning: 0, medication: 1, order: 2, referral: 3, counseling: 4, follow_up: 5 } as const;
    const sorted = [...p.plan].sort((a, b2) => order[a.type] - order[b2.type] || a.seq - b2.seq);
    const items: typeof sorted = [];
    for (const it of sorted) {
      const prev = items[items.length - 1];
      const verb = it.text.split(" ")[0];
      if (prev && prev.type === "medication" && it.type === "medication" && prev.evidence[0] === it.evidence[0] && prev.text.split(" ")[0] === verb && !/\d/.test(prev.text + it.text)) {
        const rest = (t: string) => t.slice(verb.length + 1).replace(/\.$/, "");
        const [n1, ...tail1] = rest(prev.text).split(" ");
        const [n2, ...tail2] = rest(it.text).split(" ");
        const tail = tail1.join(" ") || tail2.join(" ");
        items[items.length - 1] = { ...prev, ref: `${prev.ref}+${it.ref}`, text: `${verb} ${n1} ${/^(Continue|Discontinue|Hold|Stop)$/.test(verb) ? "and" : "or"} ${n2}${tail ? " " + tail : ""}.` };
        continue;
      }
      items.push(it);
    }
    for (const it of items) {
      if (split === "assessment" && it.type !== "reasoning") continue;
      if (split === "plan" && it.type === "reasoning") continue;
      if (verbosity === "concise" && it.type === "reasoning" && items.length > 2) continue;
      out.push(b.s(it.text, it.evidence, "fact", { indent: 1 }));
    }
    if (!items.length && p.chronic && split !== "assessment") out.push(b.s("Continue current management", p.evidence.slice(0, 1), "fact", { indent: 1 }));
  });
  if (split !== "assessment") {
    if (facts.followUp) out.push(b.s(facts.followUp.text, facts.followUp.evidence));
    for (const r of facts.returnPrecautions.slice(0, 2)) out.push(b.s(r.text, r.evidence));
    if (facts.patientQuestions.length && verbosity !== "concise") {
      out.push(b.s(`Patient questions addressed: ${facts.patientQuestions.map((q) => q.text.replace(/\?$/, "").toLowerCase()).join("; ")}`, facts.patientQuestions.flatMap((q) => q.evidence)));
    }
  }
  return out;
}

function socialSentences(b: Builder, facts: Facts, ctx: NoteContext): NoteSentence[] {
  const out: NoteSentence[] = facts.social.map((s) => b.s(s.text, s.evidence));
  for (const s of ctx.patient?.chart.social ?? []) {
    const topic = s.split(/[:,]/)[0].toLowerCase();
    if (out.some((o) => o.text.toLowerCase().includes(topic.split(" ")[0]))) continue;
    if (/smok/i.test(s) && facts.social.some((x) => /tobacco/i.test(x.text))) continue;
    out.push(b.s(s, ["chart"], "carried"));
  }
  return out;
}

function instructionSentences(b: Builder, facts: Facts): NoteSentence[] {
  const out: NoteSentence[] = [];
  for (const m of facts.meds.filter((x) => ["start", "change", "increase", "decrease", "stop"].includes(x.action) && !x.cancelled)) {
    const verb = { start: "Start", change: "Change to", increase: "Increase", decrease: "Decrease", stop: "Stop" }[m.action as "start"];
    out.push(b.s(`${verb} ${medLabel(m)}`, m.evidence));
  }
  for (const c of facts.counseling) out.push(b.s(c.text.replace(/^Counseled to /, ""), c.evidence));
  for (const r of facts.returnPrecautions) out.push(b.s(r.text.replace(/^Return precautions: /, ""), r.evidence));
  if (facts.followUp) out.push(b.s(facts.followUp.text, facts.followUp.evidence));
  return out;
}

export function buildSection(ts: TemplateSection, facts: Facts, ctx: NoteContext): NoteSection {
  const b = new Builder(ts.key);
  const verbosity = ctx.template.style.verbosity ?? "standard";
  const kind: SectionKind = ts.kind;
  let sentences: NoteSentence[] = [];
  switch (kind) {
    case "chief_complaint": {
      const cc = facts.chiefComplaint;
      if (cc) sentences = [b.s(sentenceCase(cc.label), cc.evidence)];
      else if (ctx.encounter.reason) sentences = [b.s(ctx.encounter.reason, [], "carried")];
      break;
    }
    case "hpi":
      sentences = hpiSentences(b, facts, ctx, verbosity);
      break;
    case "ros":
      sentences = rosSentences(b, facts);
      break;
    case "pmh":
      sentences = (ctx.patient?.chart.problems ?? []).map((p) => b.s(`${p.name}${p.since ? ` (since ${p.since})` : ""}`, ["chart"], "carried"));
      break;
    case "medications":
      sentences = medsSentences(b, facts, ctx);
      break;
    case "allergies":
      sentences = allergySentences(b, facts, ctx);
      break;
    case "social":
      sentences = socialSentences(b, facts, ctx);
      break;
    case "family":
      sentences = facts.family.map((f) => b.s(f.text, f.evidence));
      break;
    case "vitals":
      sentences = vitalsSentence(b, facts, ctx);
      break;
    case "exam":
      sentences = examSentences(b, facts);
      break;
    case "mental_status":
      sentences = examSentences(b, facts, { psychOnly: true });
      break;
    case "results":
      sentences = resultSentences(b, facts, ctx);
      break;
    case "assessment_plan":
      sentences = apSentences(b, facts, verbosity);
      break;
    case "assessment":
      sentences = apSentences(b, facts, verbosity, "assessment");
      break;
    case "plan":
      sentences = apSentences(b, facts, verbosity, "plan");
      break;
    case "subjective": {
      const cc = facts.chiefComplaint;
      const followUp = ctx.encounter.visitType === "follow-up" && facts.problems.some((p) => p.chronic && !p.fromSymptom);
      if (verbosity !== "concise") {
        if (followUp && ctx.encounter.reason) sentences.push(b.s(`Chief complaint: ${ctx.encounter.reason.toLowerCase()}`, [], "carried"));
        else if (cc) sentences.push(b.s(`Chief complaint: ${cc.label}`, cc.evidence));
      }
      sentences.push(...hpiSentences(b, facts, ctx, verbosity));
      if (verbosity === "detailed") sentences.push(...rosSentences(b, facts).map((s) => ({ ...s, text: `ROS — ${s.text}` })));
      break;
    }
    case "objective": {
      const v = vitalsSentence(b, facts, ctx).map((s) => ({ ...s, text: `Vitals: ${s.text}` }));
      sentences = [...v, ...examSentences(b, facts), ...resultSentences(b, facts, ctx)];
      break;
    }
    case "patient_instructions":
      sentences = instructionSentences(b, facts);
      break;
    case "follow_up":
      if (facts.followUp) sentences.push(b.s(facts.followUp.text, facts.followUp.evidence));
      for (const r of facts.returnPrecautions) sentences.push(b.s(r.text, r.evidence));
      break;
    case "risk":
      sentences = riskSentences(assessRisk(ctx.utterances ?? []), ts.key);
      break;
    case "interventions":
      sentences = interventionSentences(ctx.utterances ?? [], ts.key);
      break;
    case "response":
      sentences = responseSentences(ctx.utterances ?? [], ts.key);
      break;
    case "goals":
      sentences = goalSentences(ctx.utterances ?? [], ctx.patient?.chart.priorVisits?.[0]?.plan ?? [], ts.key);
      break;
    case "therapy_time": {
      if (ctx.template.id === "psych_med_mgmt") {
        const pt = psychotherapyMinutes(ctx.utterances ?? []);
        const addon = pt ? psychotherapyCode(pt.minutes, true) : null;
        sentences = [pt ? b.s(`Psychotherapy time: ${pt.minutes} minutes, separate from time spent on E/M services${addon ? ` (supports ${addon})` : " (under 16 minutes; add-on not billable)"}.`, pt.evidence) : b.s("Psychotherapy time: *** minutes, separate from time spent on E/M services.", [], "system")];
        break;
      }
      if (ctx.template.id === "bh_group") {
        const min = Math.round(ctx.minutes ?? 0);
        sentences = [b.s(min ? `Group psychotherapy session: ${min} minute${min === 1 ? "" : "s"} (90853).` : "Group session time: *** minutes.", [], "system")];
        break;
      }
      const min = Math.round((ctx.minutes ?? 0));
      const code = psychotherapyCode(min);
      sentences = [b.s(min ? `Psychotherapy time: ${min} minutes face to face${code ? ` (supports ${code})` : " (under 16 minutes; not separately billable)"}.` : "Session time: *** minutes.", [], "system")];
      break;
    }
    case "ed_course":
      sentences = edCourse(ctx.utterances ?? [], ctx.startedAt ?? null, ts.key);
      break;
    case "disposition":
      sentences = edDisposition(ctx.utterances ?? [], ts.key);
      break;
    case "onc_history":
      sentences = oncologyHistorySentences(extractOncology(ctx.utterances ?? [], ctx.patient?.chart.oncology), ctx.patient?.chart.oncology, ts.key);
      break;
    case "onc_treatment":
      sentences = treatmentSentences(extractOncology(ctx.utterances ?? [], ctx.patient?.chart.oncology), ts.key);
      break;
    case "toxicity":
      sentences = toxicitySentences(extractOncology(ctx.utterances ?? [], ctx.patient?.chart.oncology), ts.key);
      break;
    case "group_topic": {
      const topic = groupTopic(ctx.utterances ?? []);
      sentences = [b.s(`${ctx.encounter.reason.replace(/^Group psychotherapy: /, "Group psychotherapy session: ")}.`, [], "system")];
      if (topic) sentences.push(b.s(`Topic: ${topic.text}.`, topic.evidence));
      break;
    }
    case "group_participation": {
      const pr = pronounsFor(ctx.patient?.pronouns ?? "", ctx.patient?.sex ?? "X");
      const own = (ctx.utterances ?? []).filter((u) => u.speaker === "patient" && u.text.split(/\s+/).length >= 4);
      sentences = own.map((u) => b.s(`Shared: ${ensurePeriod(toThirdPerson(u.text.replace(/^(?:yeah|yes|well|so|um|honestly),?\s+/i, ""), pr))}`, [u.id]));
      if (!own.length) sentences = [b.s("Attended the session with minimal verbal participation. ***", [], "system")];
      break;
    }
    case "therapy_services":
    case "therapy_measures":
    case "therapy_eval": {
      const disc = therapyDiscipline(ctx.template.id) ?? "PT";
      const f = extractTherapy(ctx.utterances ?? [], { comorbidities: (ctx.patient?.chart.problems ?? []).length, evaluation: therapyEvaluation(ctx.template.id, ctx.utterances ?? []) });
      if (kind === "therapy_services") sentences = serviceSentences(f, ts.key);
      else if (kind === "therapy_measures") sentences = measureSentences(f, ts.key);
      else if (f.evaluation) {
        const code = f.evaluation.kind === "re" ? EVALS[disc].re : EVALS[disc][f.evaluation.complexity];
        sentences = [b.s(`${disc} ${f.evaluation.kind === "re" ? "re-evaluation" : `evaluation, ${f.evaluation.complexity} complexity`} (${code}): ${f.evaluation.basis}. Confirm complexity before signing.`, [], "system")];
      }
      break;
    }
    case "ob_summary":
    case "ob_warning":
    case "ob_exam":
    case "ob_due": {
      const preg = ctx.patient?.chart.pregnancy;
      const f = extractPrenatal(ctx.utterances ?? [], preg, new Date(ctx.encounter.scheduledAt));
      sentences = kind === "ob_summary" ? pregnancySentences(preg, f, ts.key) : kind === "ob_warning" ? warningSentences(f, ts.key) : kind === "ob_exam" ? obExamSentences(f, ts.key) : dueSentences(prenatalDue(preg, f), ts.key);
      break;
    }
    case "gdmt": {
      const g = gdmtFor(ctx.utterances ?? [], facts, ctx.patient?.chart);
      sentences = gdmtSentences(g.ef, g.pillars, ts.key);
      break;
    }
    case "well_screens":
    case "guidance":
    case "imm_due": {
      const dob = ctx.patient?.dob;
      if (!dob) {
        sentences = [b.s("Attach the patient to see age-based screenings.", [], "system")];
        break;
      }
      const at = new Date(ctx.encounter.scheduledAt);
      const r = wellChild(ageInMonths(dob, at), ctx.utterances ?? []);
      if (kind === "well_screens") sentences = screenSentences(r, ts.key);
      else if (kind === "guidance") sentences = guidanceSentences(r, ts.key);
      else {
        const gaps = immunizationGaps(dob, ctx.patient?.chart.immunizations ?? [], at);
        sentences = gaps.length ? gaps.map((g) => b.s(`Due: ${dueLabel(g)}.`, [], "system")) : [b.s("Up to date for age.", [], "system")];
      }
      break;
    }
    case "awv":
    case "screening_schedule":
    case "acp": {
      const r = awvReview(ctx.utterances ?? [], ctx.patient?.chart, facts);
      if (kind === "awv") sentences = awvSentences(r, ts.key);
      else if (kind === "acp") sentences = acpSentences(r, ts.key);
      else sentences = ctx.patient ? scheduleSentences(screeningSchedule(ageFrom(ctx.patient.dob, new Date(ctx.encounter.scheduledAt)), ctx.patient.sex, ctx.patient.chart, new Date(ctx.encounter.scheduledAt)), ts.key) : [];
      break;
    }
    case "msk_exam":
      sentences = mskSentences(extractMsk(ctx.utterances ?? []), ts.key);
      break;
    case "skin_exam":
      sentences = lesionSentences(extractLesions(ctx.utterances ?? []), ts.key);
      break;
    case "procedure_note":
      sentences = procedureSentences(extractProcedures(ctx.utterances ?? []), ts.key);
      break;
    case "custom":
      sentences = [];
      break;
  }
  return { key: ts.key, title: ts.title, format: ts.format, sentences };
}

export function therapyDiscipline(templateId: string) {
  return templateId.startsWith("pt_") ? "PT" : templateId.startsWith("ot_") ? "OT" : templateId.startsWith("slp_") ? "SLP" : null;
}

export function therapyEvaluation(templateId: string, utts: import("../types").Utterance[]): "initial" | "re" | null {
  if (!/_eval$/.test(templateId)) return null;
  return utts.some((u) => /\b(?:re-?evaluation|re-?eval|progress report)\b/i.test(u.text)) ? "re" : "initial";
}

export function buildNote(facts: Facts, ctx: NoteContext): Note {
  return {
    sections: ctx.template.sections.map((ts) => buildSection(ts, facts, ctx)),
    meta: { engine: "local", templateId: ctx.template.id, generatedAt: new Date().toISOString(), sensitive: /^(?:bh_|behavioral|psych_)/.test(ctx.template.id) || undefined },
  };
}

export function noteToText(note: Note, opts: { includePending?: boolean } = {}) {
  const lines: string[] = [];
  for (const sec of note.sections) {
    const sentences = sec.sentences.filter((s) => opts.includePending || !s.pending);
    if (!sentences.length) continue;
    lines.push(sec.title.toUpperCase());
    if (sec.format === "paragraph") lines.push(sentences.map((s) => s.text).join(" "));
    else for (const s of sentences) lines.push(`${s.indent ? "   - " : s.heading ? "" : "- "}${s.text}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
