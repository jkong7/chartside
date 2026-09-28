import type { NoteSentence, Utterance } from "../types";

export interface RiskAssessment {
  screened: boolean;
  ideation: "none" | "passive" | "active" | null;
  plan: "none" | "present" | null;
  intent: "none" | "present" | null;
  means: "none" | "restricted" | "access" | null;
  priorAttempt: "none" | "yes" | null;
  homicidal: "none" | "present" | null;
  protective: string[];
  safetyPlan: boolean;
  level: "low" | "moderate" | "high" | null;
  missing: string[];
  evidence: Record<string, string[]>;
}

const SI_Q = /\b(?:thoughts? (?:of|about) (?:hurting|killing|harming) (?:yourself|your self)|better off dead|suicid\w*|end(?:ing)? your life|want(?:ed)? to die|not wake up|harm yourself|hurt yourself)\b/i;
const PLAN_Q = /\b(?:plan|how you would|thought about how|method)\b/i;
const INTENT_Q = /\b(?:intent(?:ion)?|act on|going to act|do something about)\b/i;
const MEANS_Q = /\b(?:guns?|firearms?|weapons?|stockpil\w*|pills? saved|medications? (?:at|in the) home|access to)\b/i;
const ATTEMPT_Q = /\b(?:tried to (?:hurt|kill|harm)|(?:suicide |past |prior |previous )?attempts?|ever (?:hurt|harmed) yourself)\b/i;
const HI_Q = /\b(?:hurt(?:ing)? (?:someone|anyone|others)|harm(?:ing)? (?:someone|anyone|others)|homicid\w*)\b/i;
const DENY = /^(?:no|nope|nah|never|not really|not at all|i don'?t|none)\b|\bno plan\b|\bnever\b/i;
const PASSIVE = /\b(?:easier if|didn'?t wake up|not wake up|better off (?:dead|without me)|wish i (?:was|were) (?:dead|gone)|disappear)\b/i;
const ACTIVE = /\b(?:kill(?:ing)? myself|end(?:ing)? (?:my life|it all)|take my (?:own )?life|suicide)\b/i;
const PROTECTIVE = /\b(my (?:daughter|son|kids|children|family|wife|husband|partner|mom|dad|mother|father|dog|cat|pets?|faith|church|job|friends))\b/gi;

function answerAfter(utts: Utterance[], i: number) {
  for (let k = i + 1; k < Math.min(utts.length, i + 3); k++) if (utts[k].speaker !== "clinician") return utts[k];
  return null;
}

export function assessRisk(utts: Utterance[]): RiskAssessment {
  const r: RiskAssessment = { screened: false, ideation: null, plan: null, intent: null, means: null, priorAttempt: null, homicidal: null, protective: [], safetyPlan: false, level: null, missing: [], evidence: {} };
  const ev = (k: string, ...ids: string[]) => (r.evidence[k] = [...(r.evidence[k] ?? []), ...ids]);
  utts.forEach((u, i) => {
    if (u.speaker === "clinician") {
      const a = answerAfter(utts, i);
      if (SI_Q.test(u.text) && /\?|\bany\b|\bhave you\b/i.test(u.text)) {
        r.screened = true;
        ev("ideation", u.id);
        if (a) {
          ev("ideation", a.id);
          if (ACTIVE.test(a.text) && !DENY.test(a.text)) r.ideation = "active";
          else if (PASSIVE.test(a.text) || /\b(?:sometimes|yes|yeah|a little|at times)\b/i.test(a.text)) r.ideation = r.ideation === "active" ? "active" : "passive";
          else if (DENY.test(a.text)) r.ideation ??= "none";
        }
      }
      if (PLAN_Q.test(u.text) && /\?/.test(u.text) && r.screened) {
        ev("plan", u.id);
        if (a) {
          ev("plan", a.id);
          r.plan = DENY.test(a.text) || /\bno plan\b/i.test(a.text) ? "none" : "present";
        }
      }
      if (INTENT_Q.test(u.text) && /\?/.test(u.text) && r.screened) {
        ev("intent", u.id);
        if (a) {
          ev("intent", a.id);
          r.intent = DENY.test(a.text) ? "none" : "present";
        }
      }
      if (MEANS_Q.test(u.text) && /\?/.test(u.text)) {
        ev("means", u.id);
        if (a) {
          ev("means", a.id);
          r.means = /\b(?:keeps?|locked|holds?|removed|gave (?:them|it) to)\b/i.test(a.text) ? "restricted" : DENY.test(a.text) || /\bno guns?\b/i.test(a.text) ? "none" : "access";
          if (r.means === "none" && /\b(?:keeps?|locked|holds?)\b/i.test(a.text)) r.means = "restricted";
        }
      }
      if (ATTEMPT_Q.test(u.text) && /\?/.test(u.text)) {
        ev("priorAttempt", u.id);
        if (a) {
          ev("priorAttempt", a.id);
          r.priorAttempt = DENY.test(a.text) ? "none" : "yes";
        }
      }
      if (HI_Q.test(u.text) && /\?/.test(u.text)) {
        ev("homicidal", u.id);
        if (a) {
          ev("homicidal", a.id);
          r.homicidal = DENY.test(a.text) ? "none" : "present";
        }
      }
      if (/\bsafety plan\b/i.test(u.text)) {
        r.safetyPlan = true;
        ev("safetyPlan", u.id);
      }
    } else {
      for (const m of u.text.matchAll(PROTECTIVE)) {
        const p = m[1].toLowerCase().replace(/^my /, "");
        if (!r.protective.includes(p)) r.protective.push(p);
        ev("protective", u.id);
      }
      if (!r.screened && ACTIVE.test(u.text) && !DENY.test(u.text)) {
        r.screened = true;
        r.ideation = "active";
        ev("ideation", u.id);
      }
    }
  });
  if (r.ideation && r.ideation !== "none") {
    if (!r.plan) r.missing.push("plan");
    if (!r.intent) r.missing.push("intent");
    if (!r.means) r.missing.push("access to lethal means");
    if (!r.priorAttempt) r.missing.push("prior attempts");
    if (!r.safetyPlan) r.missing.push("safety plan");
    r.level = r.plan === "present" || r.intent === "present" || r.priorAttempt === "yes" && r.ideation === "active" ? "high" : r.ideation === "active" || r.means === "access" || r.priorAttempt === "yes" ? "moderate" : "low";
  } else if (r.homicidal === "present") r.level = "high";
  return r;
}

export function riskSentences(r: RiskAssessment, key: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  let n = 0;
  const s = (text: string, ev: string[] = [], kind: NoteSentence["kind"] = "fact") => out.push({ id: `${key}_${++n}`, text, evidence: [...new Set(ev)], kind: ev.length ? kind : "system", support: "strong" });
  if (!r.screened) {
    s("Suicide risk was not assessed in this session. ***");
    return out;
  }
  if (r.ideation === "none") s(`Denies suicidal ideation${r.homicidal === "none" ? " and homicidal ideation" : ""}.`, [...(r.evidence.ideation ?? []), ...(r.evidence.homicidal ?? [])]);
  else if (r.ideation) {
    s(`Suicidal ideation: ${r.ideation === "passive" ? "passive (wishes to be dead without active thoughts of killing self)" : "active"}.`, r.evidence.ideation);
    if (r.plan) s(`Plan: ${r.plan === "none" ? "denies" : "endorses a plan"}.`, r.evidence.plan);
    if (r.intent) s(`Intent: ${r.intent === "none" ? "denies" : "endorses intent"}.`, r.evidence.intent);
    if (r.means) s(`Access to lethal means: ${r.means === "none" ? "denies firearms or stockpiled medications" : r.means === "restricted" ? "means restricted (medications held by support person)" : "has access; means restriction counseling indicated"}.`, r.evidence.means);
    if (r.priorAttempt) s(`Prior attempts: ${r.priorAttempt === "none" ? "denies" : "reports prior attempt"}.`, r.evidence.priorAttempt);
    if (r.homicidal) s(`Homicidal ideation: ${r.homicidal === "none" ? "denies" : "endorses"}.`, r.evidence.homicidal);
    if (r.protective.length) s(`Protective factors: ${r.protective.join(", ")}.`, r.evidence.protective);
    if (r.safetyPlan) s("Safety plan reviewed and updated with the patient, including warning signs, coping strategies, contacts, and crisis line 988.", r.evidence.safetyPlan);
    s(`Clinician risk formulation: ${r.level} acute risk. ***`);
  }
  return out;
}

const INTERVENTIONS: { re: RegExp; label: string }[] = [
  { re: /\b(?:evidence for and against|cognitive restructuring|reframe|thought record|challenge (?:that|the) thought|automatic thought)/i, label: "Cognitive restructuring (CBT)" },
  { re: /\b(?:enjoyable activit|behavioral activation|schedule (?:one|an?|some)|plan (?:three|two|one|\d+) (?:walks?|activities))/i, label: "Behavioral activation" },
  { re: /\bsafety plan/i, label: "Safety planning" },
  { re: /\b(?:mindful|breathing exercise|grounding|5-4-3-2-1)/i, label: "Mindfulness and grounding skills" },
  { re: /\b(?:on a scale of|how important|how confident|what would it take|pros and cons)/i, label: "Motivational interviewing" },
  { re: /\b(?:exposure|fear ladder|hierarchy)/i, label: "Exposure therapy" },
  { re: /\b(?:DBT|distress tolerance|opposite action|TIPP|wise mind)/i, label: "DBT skills" },
  { re: /\b(?:(?:depression|anxiety) (?:often|can|commonly|is (?:a )?(?:common|treatable))|it'?s (?:very )?common|psychoeducation)/i, label: "Psychoeducation" },
  { re: /\b(?:sleep hygiene|same time every (?:night|morning))/i, label: "Sleep hygiene education" },
  { re: /\b(?:homework|this week,? (?:let'?s|try)|between now and)/i, label: "Homework assigned" },
];

export function interventionSentences(utts: Utterance[], key: string): NoteSentence[] {
  const found = new Map<string, string[]>();
  for (const u of utts) {
    if (u.speaker !== "clinician") continue;
    for (const i of INTERVENTIONS) if (i.re.test(u.text)) found.set(i.label, [...(found.get(i.label) ?? []), u.id]);
  }
  return [...found.entries()].map(([label, ev], n) => ({ id: `${key}_${n + 1}`, text: `${label}.`, evidence: ev, kind: "fact", support: "strong" }));
}

export function responseSentences(utts: Utterance[], key: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  utts.forEach((u, i) => {
    if (u.speaker === "clinician" || i === 0) return;
    const prev = utts[i - 1];
    if (prev.speaker !== "clinician" || !INTERVENTIONS.some((x) => x.re.test(prev.text))) return;
    const engaged = /\b(?:i can|i'?ll try|i will|that helps|helped|makes sense|i guess|maybe|okay|good idea)\b/i.test(u.text);
    const resistant = /\b(?:won'?t work|doesn'?t help|i can'?t|no point|pointless)\b/i.test(u.text);
    out.push({ id: `${key}_${out.length + 1}`, text: `${resistant ? "Expressed doubt" : engaged ? "Engaged and receptive" : "Responded"}: "${u.text.trim()}"`, evidence: [u.id], kind: "fact", support: "strong" });
  });
  return out.slice(0, 5);
}

export function psychotherapyCode(minutes: number, withEm = false) {
  if (minutes < 16) return null;
  if (withEm) return minutes >= 53 ? "90838" : minutes >= 38 ? "90836" : "90833";
  return minutes >= 53 ? "90837" : minutes >= 38 ? "90834" : "90832";
}

export const SENSITIVE_TEMPLATES = /^(?:bh_|behavioral)/;
