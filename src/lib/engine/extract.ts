import type { Chart, Utterance } from "../types";
import {
  ALLERGY_GROUPS,
  CONDITIONS,
  EXAM_SYSTEMS,
  MEDICATIONS,
  ORDERABLES,
  REFERRALS,
  SYMPTOMS,
  type ConditionDef,
  type MedDef,
  type OrderDef,
  type SymptomDef,
} from "./lexicon";
import { clinicianToNote, pronounsFor, splitClauses, toThirdPerson, unique, wordToNumber } from "./text";

export interface SymptomFact {
  key: string;
  label: string;
  system: SymptomDef["system"];
  negated: boolean;
  evidence: string[];
  duration?: string;
  onset?: string;
  severity?: string;
  quality?: string;
  location?: string;
  radiation?: string;
  timing?: string;
  aggravating?: string[];
  relieving?: string[];
  tried?: string[];
  context?: string;
  firstSeq: number;
}

export type MedAction = "taking" | "start" | "stop" | "increase" | "decrease" | "continue" | "refill" | "change" | "not_taking" | "side_effect";

export interface MedFact {
  name: string;
  cls: string;
  rx: boolean;
  def: MedDef;
  action: MedAction;
  dose?: string;
  frequency?: string;
  note?: string;
  cancelled?: boolean;
  evidence: string[];
  seq: number;
}

export interface AllergyFact {
  substance: string;
  reaction?: string;
  evidence: string[];
}

export interface VitalFact {
  name: "BP" | "HR" | "Temp" | "SpO2" | "Weight" | "RR" | "BMI" | "Home BP";
  value: string;
  evidence: string[];
  abnormal: boolean;
}

export interface ResultFact {
  name: string;
  value: string;
  evidence: string[];
  abnormal: boolean;
}

export interface ExamFact {
  system: string;
  text: string;
  abnormal: boolean;
  evidence: string[];
}

export interface PlanItem {
  type: "medication" | "order" | "referral" | "counseling" | "follow_up" | "reasoning";
  ref?: string;
  text: string;
  evidence: string[];
  seq: number;
}

export interface ProblemFact {
  key: string;
  label: string;
  icd10: string;
  def: ConditionDef | null;
  chronic: boolean;
  status?: string;
  assessed: boolean;
  fromSymptom?: boolean;
  evidence: string[];
  firstSeq: number;
  plan: PlanItem[];
  reasoning: string[];
}

export interface OrderFact {
  kind: OrderDef["kind"] | "referral";
  name: string;
  detail: string;
  cpt?: string;
  evidence: string[];
  seq: number;
  problemKey?: string;
}

export interface Facts {
  chiefComplaint: { key: string; label: string; evidence: string[] } | null;
  symptoms: SymptomFact[];
  meds: MedFact[];
  allergies: AllergyFact[];
  nkda: string[] | null;
  vitals: VitalFact[];
  results: ResultFact[];
  exam: ExamFact[];
  problems: ProblemFact[];
  orders: OrderFact[];
  counseling: PlanItem[];
  followUp: { text: string; interval?: string; evidence: string[] } | null;
  returnPrecautions: { text: string; evidence: string[] }[];
  social: { text: string; evidence: string[] }[];
  family: { text: string; evidence: string[] }[];
  patientQuestions: { text: string; evidence: string[] }[];
  asked: { meds: string[]; allergies: string[]; social: string[]; questions: string[] };
  languages: string[];
  interpreter: boolean;
}

const NEG_CUE = /\b(no|not|denies|denied|deny|without|never|haven't|hasn't|havent|don't|doesn't|didn't|dont|negative for|free of|none|nope|nor)\b/i;
const AFFIRM = /^(yes|yeah|yep|yup|a little|some|sometimes|kind of|kinda|i do|i have|it does|definitely|mhm|uh-huh|uh huh)\b/i;
const DENY = /^(no|nope|nah|not really|not at all|i don't think so|never|none)\b/i;

function isQuestion(u: Utterance) {
  return /\?\s*$/.test(u.text) || /^(any|do you|does it|did you|have you|are you|is it|how|what|when|where|which|can you|could you|tell me)\b/i.test(u.text.trim());
}

function negatedAt(text: string, index: number) {
  const before = text.slice(Math.max(0, index - 45), index);
  const clauseStart = Math.max(before.lastIndexOf(","), before.lastIndexOf(" but "), before.lastIndexOf("."));
  const window = clauseStart >= 0 ? before.slice(clauseStart + 1) : before;
  return NEG_CUE.test(window);
}

function findSymptoms(text: string) {
  const hits: { def: SymptomDef; index: number; negated: boolean }[] = [];
  for (const def of SYMPTOMS) {
    for (const re of def.patterns) {
      const m = re.exec(text);
      if (m) {
        hits.push({ def, index: m.index, negated: negatedAt(text, m.index) });
        break;
      }
    }
  }
  return hits;
}

const DURATION = /\b(?:for|about|over|past|last|almost|nearly)\s+(?:the\s+)?(?:past\s+|last\s+)?((?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|a few|a couple of|couple of|few|several|\d+)\s+(?:day|week|month|year|hour)s?)\b/i;
const SINCE = /\b(since\s+(?:yesterday|last\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this morning|the weekend|\w+ ago)|started\s+(?:about\s+)?(?:(?:a|an|one|two|three|four|five|six|seven|\d+|a few|a couple of)\s+(?:day|week|month|year)s?\s+ago|yesterday|last\s+\w+|this morning))\b/i;
const SEVERITY = /\b(\d{1,2})\s*(?:out of|\/|on a scale of)\s*10\b|\b(mild|moderate|severe|excruciating|unbearable|really bad|pretty bad|not too bad)\b/i;
const QUALITY = /\b(sharp|dull|achy|aching|burning|throbbing|stabbing|pressure-like|pressure|cramping|crampy|squeezing|shooting|pounding|tight|dry|wet|productive|hacking)\b/i;
const LOCATION = /\b(left|right|both|bilateral|lower|upper|middle|front|back|behind (?:my|the) eyes|temples?|forehead)\b(?:\s+(side|sides|ear|knee|shoulder|arm|leg|back|chest|abdomen|quadrant))?/i;
const RADIATION = /\b(?:radiat\w+|goes|shoots?|shooting|travels?|spreads?)\s+(?:down|up|into|to)\s+(?:my|the|her|his|their)?\s*([a-z\s]+?)(?:[,.]|$| and| when)/i;
const TIMING = /\b(at night|in the morning|in the evening|after (?:eating|meals|I eat)|comes and goes|on and off|constant(?:ly)?|all the time|every day|daily|intermittent(?:ly)?|worse in the (?:morning|evening|afternoon)|when I lie down|when I wake up)\b/i;
const AGGRAVATING = /\b(?:worse|worsens|aggravated|hurts more|flares up)\s+(?:when|with|after|if|by|during)\s+([^,.;]+)/i;
const RELIEVING = /\b(?:better|improves|helps?|relieved|eases up|goes away)\s+(?:when|with|after|if|by)\s+([^,.;]+)|\b([a-z]+(?:\s+[a-z]+)?)\s+(?:helps|seems to help|helped)\b/i;
const TRIED = /\b(?:tried|been taking|took|using|used|gave (?:her|him|them)|giving (?:her|him|them))\s+(?:some\s+)?([a-z]+(?:\s+[a-z]+)?)/i;
const CONTEXT = /\b((?:ever )?since I was \w+ing[^,.;]*|after (?:lifting|a fall|falling|moving|running|playing|working out|a trip|traveling|starting)[^,.;]*|since (?:starting|the new)[^,.;]*|when I was (?:lifting|moving|playing)[^,.;]*|(?:my|her|his) (?:kids?|son|daughter|husband|wife|coworkers?) (?:had|has|have) (?:the same|been sick|a cold|it)[^,.;]*)/i;

const DOSE = /(\d+(?:\.\d+)?)\s*(mg|milligrams?|mcg|micrograms?|units?|grams?|g|ml|puffs?)\b/i;
const FREQ = /\b(once (?:a|per) day|twice (?:a|per) day|three times (?:a|per) day|four times (?:a|per) day|once daily|twice daily|daily|every (?:morning|night|evening|day|other day|\d+ (?:to \d+ )?hours)|at bedtime|before bed|as needed|with meals|with breakfast|BID|TID|QID|QHS|PRN|once a week|weekly)\b/i;

const START = /\b(start(?:ing)?|begin|prescrib\w*|put (?:you|her|him|them) on|try (?:you on|taking)?|going to give (?:you|her|him)|send (?:in )?(?:a )?prescription for|add(?:ing)?|switch (?:you )?(?:over )?to|recommend (?:taking|trying)?|take)\b/i;
const INCREASE = /\b(increas\w*|bump\w*(?: up)?|go(?:ing)? up (?:on|to)|double|raise|titrate up|up the dose)\b/i;
const DECREASE = /\b(decreas\w*|lower\w*|cut (?:back|down)|reduc\w*|go(?:ing)? down (?:on|to)|halve)\b/i;
const STOP = /\b(stop\w*|skip(?:ping)?|cancel\w*|discontinu\w*|come off|coming off|hold(?:ing)? (?:off )?(?:on )?|get (?:you )?off|switch (?:you )?(?:off|from))\b/i;
const CONTINUE = /\b(continu\w*|keep (?:taking|on|using|giving)|stay on|same dose|no changes? to)\b/i;
const REFILL = /\b(refill\w*|renew\w*)\b/i;
const PT_TAKING = /\b(I(?:'m| am)? (?:take|taking|on|using)|I've been (?:taking|using|on)|she(?:'s| is) (?:taking|on)|he(?:'s| is) (?:taking|on))\b/i;
const PT_NOT_TAKING = /\b(stopped taking|ran out|haven't been taking|not taking|forget to take|forgot to take|miss(?:ed)? (?:a few|some|my) doses?|skip(?:ping|s)? (?:the|my|a|some)\b[^,.]*dose)\b/i;
const SIDE_EFFECT = /\b(side effects?|upsets? (?:my |her |his )?stomach|makes me (?:dizzy|nauseous|sick|tired)|gives me (?:a )?(?:cough|diarrhea|headaches?)|causing|dry cough)\b/i;

const MED_INDICATIONS: Record<string, string[]> = {
  "ACE inhibitor": ["htn", "ckd", "hf"],
  ARB: ["htn", "ckd", "hf"],
  "calcium channel blocker": ["htn"],
  "thiazide diuretic": ["htn"],
  "thiazide-like diuretic": ["htn"],
  "beta blocker": ["htn", "afib", "hf"],
  "loop diuretic": ["hf", "htn"],
  "mineralocorticoid antagonist": ["hf", "htn"],
  biguanide: ["t2dm", "prediabetes"],
  sulfonylurea: ["t2dm"],
  "SGLT2 inhibitor": ["t2dm", "hf", "ckd"],
  "GLP-1 receptor agonist": ["t2dm", "obesity"],
  "GIP/GLP-1 receptor agonist": ["t2dm", "obesity"],
  "basal insulin": ["t2dm"],
  statin: ["hld", "t2dm"],
  anticoagulant: ["afib"],
  "thyroid hormone": ["hypothyroid"],
  "proton pump inhibitor": ["gerd"],
  "H2 blocker": ["gerd"],
  "short-acting bronchodilator": ["asthma", "copd", "bronchitis"],
  "ICS/LABA": ["asthma", "copd"],
  "leukotriene antagonist": ["asthma", "allergic_rhinitis"],
  corticosteroid: ["allergic_rhinitis", "asthma", "sinusitis"],
  antihistamine: ["allergic_rhinitis", "uri"],
  "penicillin antibiotic": ["aom", "strep", "sinusitis", "pneumonia"],
  "macrolide antibiotic": ["pneumonia", "strep", "bronchitis"],
  "tetracycline antibiotic": ["pneumonia", "sinusitis"],
  "cephalosporin antibiotic": ["uti", "strep"],
  "urinary antibiotic": ["uti"],
  "sulfonamide antibiotic": ["uti"],
  "fluoroquinolone antibiotic": ["uti"],
  NSAID: ["lbp", "knee_oa", "gout", "ankle_sprain", "tth"],
  analgesic: ["lbp", "knee_oa", "tth", "uri", "ankle_sprain"],
  "muscle relaxant": ["lbp"],
  gabapentinoid: ["lbp"],
  SSRI: ["gad", "anxiety", "mdd"],
  NDRI: ["mdd", "tobacco"],
  "sedating antidepressant": ["insomnia", "mdd"],
  "antihistamine anxiolytic": ["gad", "anxiety"],
  supplement: ["vitd", "ida", "insomnia"],
  triptan: ["migraine"],
  "xanthine oxidase inhibitor": ["gout"],
  antigout: ["gout"],
  antiemetic: ["uri", "flu"],
  antitussive: ["uri", "bronchitis"],
  expectorant: ["uri", "bronchitis"],
  antiviral: ["flu", "covid"],
};

const ORDER_INDICATIONS: Record<string, string[]> = {
  "Hemoglobin A1c": ["t2dm", "prediabetes"],
  "Lipid panel": ["hld", "t2dm", "htn"],
  "Comprehensive metabolic panel": ["htn", "t2dm", "ckd"],
  "Basic metabolic panel": ["htn", "ckd", "hf"],
  "Complete blood count": ["ida", "fatigue"],
  TSH: ["hypothyroid", "fatigue"],
  Urinalysis: ["uti"],
  "Urine culture": ["uti"],
  "Urine microalbumin/creatinine ratio": ["t2dm", "ckd"],
  "Rapid strep antigen": ["strep", "pharyngitis"],
  "Influenza A/B antigen": ["flu", "uri"],
  "SARS-CoV-2 antigen": ["covid", "uri"],
  "Vitamin D, 25-hydroxy": ["vitd"],
  "Iron studies": ["ida"],
  "Uric acid": ["gout"],
  "Chest X-ray, 2 views": ["pneumonia", "bronchitis", "copd"],
  "X-ray, lumbar spine": ["lbp"],
  "MRI, lumbar spine": ["lbp"],
  "X-ray, knee": ["knee_oa"],
  "X-ray, ankle": ["ankle_sprain"],
  Echocardiogram: ["hf", "afib"],
  "12-lead ECG": ["afib", "chest_pain_dx"],
  Physical_therapy: ["lbp", "knee_oa", "ankle_sprain"],
  Behavioral_health: ["gad", "anxiety", "mdd", "insomnia"],
  Diabetes_education: ["t2dm", "prediabetes"],
  Nutrition: ["obesity", "t2dm", "hld"],
  Cardiology: ["afib", "hf", "chest_pain_dx", "htn"],
  Endocrinology: ["t2dm", "hypothyroid"],
  Dermatology: ["eczema", "contact_derm"],
  Orthopedics: ["knee_oa", "lbp", "ankle_sprain"],
  Nephrology: ["ckd"],
  Ophthalmology: ["t2dm"],
  Podiatry: ["t2dm"],
  Sleep_medicine: ["insomnia"],
  Gastroenterology: ["gerd"],
  Neurology: ["migraine"],
};

const CC_CONDITIONS: Record<string, string[]> = {
  anxiety: ["gad", "anxiety"],
  depressed_mood: ["mdd"],
  insomnia: ["insomnia"],
  cough: ["uri", "bronchitis", "pneumonia", "asthma", "copd", "covid", "flu"],
  sore_throat: ["strep", "pharyngitis", "uri"],
  ear_pain: ["aom"],
  back_pain: ["lbp"],
  dysuria: ["uti"],
  frequency: ["uti"],
  headache: ["migraine", "tth"],
  knee_pain: ["knee_oa"],
  congestion: ["uri", "sinusitis", "allergic_rhinitis"],
  fever: ["flu", "covid", "uri", "aom", "pneumonia"],
  heartburn: ["gerd"],
  rash: ["eczema", "contact_derm"],
  chest_pain: ["chest_pain_dx"],
  joint_pain: ["gout", "knee_oa"],
};

const COUNSEL_HINTS: [RegExp, string[]][] = [
  [/\b(salt|sodium|blood pressure)\b/i, ["htn"]],
  [/\b(carbs|sugars?|meal|diet)\b/i, ["t2dm", "prediabetes", "obesity"]],
  [/\b(caffeine|screens?|sleep|bedroom)\b/i, ["insomnia", "gad", "anxiety"]],
  [/\b(heat|stretch\w*|lifting|active|ice)\b/i, ["lbp", "knee_oa", "ankle_sprain"]],
  [/\b(fluids|honey|humidifier|saline|rest)\b/i, ["uri", "bronchitis", "flu", "covid", "sinusitis"]],
  [/\b(smok\w*|tobacco|vap\w*)\b/i, ["tobacco"]],
  [/\b(weight|exercise|walk\w*)\b/i, ["obesity", "t2dm", "htn"]],
];

function precautionText(clause: string) {
  const t = clause.trim().replace(/^(and|also|okay|so),?\s+/i, "").replace(/[.!]+$/, "");
  const m = /^if\s+(.*),\s*((?:call|come|go|return|bring|seek|let|please|head|text)\b.*)$/i.exec(t) ?? /^if\s+(.*?),\s*(.*)$/i.exec(t) ?? /^(.*?)\s+if\s+(.*)$/i.exec(t);
  if (m) {
    const isIfFirst = /^if/i.test(t);
    let cond = (isIfFirst ? m[1] : m[2]).trim();
    let act = (isIfFirst ? m[2] : m[1]).trim();
    cond = cond
      .replace(/\b(?:you|she|he|they)\s+(?:ever\s+)?(?:get|have|develop|notice|feel|are|is|seem|seems|start)\s+/gi, "")
      .replace(/\b(?:it's|it is|things are)\s+/gi, "")
      .replace(/\bthoughts of hurting yourself\b/gi, "thoughts of self-harm")
      .replace(/\byourself\b/gi, "themselves")
      .replace(/\byour\b/gi, "")
      .replace(/\byou\b/gi, "patient")
      .replace(/\s{2,}/g, " ")
      .replace(/\bpatient (stand|get|feel|walk|eat|sit|take|start|seem)\b/gi, "patient $1s")
      .trim();
    act = act.replace(/\b(?:bring (?:her|him|them) back|come back and see us|come back)\b/i, "return").replace(/\byour\b/gi, "the").replace(/\byou\b/gi, "patient").trim();
    return `Return precautions: ${act.charAt(0).toLowerCase()}${act.slice(1)} if ${cond}.`;
  }
  return `Return precautions: ${t.charAt(0).toLowerCase()}${t.slice(1).replace(/\byour\b/gi, "the").replace(/\byou\b/gi, "patient")}.`;
}

const SYMPTOM_CODES: Record<string, { icd10: string; label: string }> = {
  cough: { icd10: "R05.9", label: "Cough, unspecified" },
  headache: { icd10: "R51.9", label: "Headache, unspecified" },
  fatigue: { icd10: "R53.83", label: "Other fatigue" },
  dizziness: { icd10: "R42", label: "Dizziness and giddiness" },
  abdominal_pain: { icd10: "R10.9", label: "Unspecified abdominal pain" },
  chest_pain: { icd10: "R07.9", label: "Chest pain, unspecified" },
  palpitations: { icd10: "R00.2", label: "Palpitations" },
  back_pain: { icd10: "M54.50", label: "Low back pain, unspecified" },
  knee_pain: { icd10: "M25.569", label: "Pain in unspecified knee" },
  joint_pain: { icd10: "M25.50", label: "Pain in unspecified joint" },
  shoulder_pain: { icd10: "M25.519", label: "Pain in unspecified shoulder" },
  rash: { icd10: "R21", label: "Rash and other nonspecific skin eruption" },
  insomnia: { icd10: "G47.00", label: "Insomnia, unspecified" },
  sore_throat: { icd10: "J02.9", label: "Acute pharyngitis, unspecified" },
  ear_pain: { icd10: "H92.09", label: "Otalgia, unspecified ear" },
  dyspnea: { icd10: "R06.02", label: "Shortness of breath" },
  nausea: { icd10: "R11.0", label: "Nausea" },
  diarrhea: { icd10: "R19.7", label: "Diarrhea, unspecified" },
  dysuria: { icd10: "R30.0", label: "Dysuria" },
  anxiety: { icd10: "F41.9", label: "Anxiety disorder, unspecified" },
  depressed_mood: { icd10: "F32.A", label: "Depression, unspecified" },
  heartburn: { icd10: "R12", label: "Heartburn" },
  fever: { icd10: "R50.9", label: "Fever, unspecified" },
};

export function symptomCode(key: string) {
  return SYMPTOM_CODES[key];
}

function gerund(v: string) {
  const irregular: Record<string, string> = { lie: "lying", be: "being", see: "seeing", sit: "sitting", run: "running", get: "getting", stop: "stopping", swim: "swimming", put: "putting" };
  if (irregular[v]) return irregular[v];
  if (/[^e]e$/.test(v)) return v.slice(0, -1) + "ing";
  return v + "ing";
}

function gerundize(v: string) {
  return v.replace(/^(?:i|she|he|they|you)\s+(\w+)/i, (_m, verb: string) => gerund(verb.toLowerCase()));
}

function third(verb: string) {
  const irregular: Record<string, string> = { have: "has", do: "does", go: "goes", am: "is", "'m": "is", be: "is" };
  if (irregular[verb]) return irregular[verb];
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return verb + "es";
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + "ies";
  return verb + "s";
}

function socialPhrase(v: string) {
  let t = v.trim().replace(/[.,;]+$/, "");
  t = t.replace(/^I'm\s+/i, "is ").replace(/^I've\s+/i, "has ").replace(/^I (?:don't|do not)\s+(\w+)/i, "does not $1").replace(/^I (\w+)/i, (_m, verb: string) => third(verb.toLowerCase()));
  t = t.replace(/^(?:probably|maybe|about)\s+/i, "").replace(/\bmy\b/gi, "their");
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function cleanPhrase(v: string) {
  return v.trim().toLowerCase().replace(/^(?:and|but|so|the|some|a|my|her|his)\s+/g, "").replace(/^(?:the|some|a)\s+/, "").trim();
}

function firstMatch(re: RegExp, text: string) {
  const m = re.exec(text);
  if (!m) return undefined;
  return (m.slice(1).find(Boolean) ?? m[0]).trim();
}

function normDose(d?: RegExpExecArray | null) {
  if (!d) return undefined;
  const unit = d[2].toLowerCase().replace(/milligrams?/, "mg").replace(/micrograms?/, "mcg").replace(/^grams?$/, "g");
  return `${d[1]} ${unit}`;
}

function normFreq(f?: string) {
  if (!f) return undefined;
  const map: Record<string, string> = {
    "once a day": "daily", "once per day": "daily", "once daily": "daily",
    "twice a day": "twice daily", "twice per day": "twice daily", bid: "twice daily",
    "three times a day": "three times daily", tid: "three times daily",
    qhs: "at bedtime", "before bed": "at bedtime", prn: "as needed", qid: "four times daily",
  };
  const k = f.toLowerCase();
  return map[k] ?? k;
}

function medMentions(text: string) {
  const out: { def: MedDef; index: number }[] = [];
  for (const def of MEDICATIONS) {
    for (const re of def.patterns) {
      const m = re.exec(text);
      if (m) {
        out.push({ def, index: m.index });
        break;
      }
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function conditionMentions(text: string) {
  const out: { def: ConditionDef; index: number }[] = [];
  const taken: [number, number][] = [];
  for (const def of CONDITIONS) {
    for (const re of def.patterns) {
      const m = re.exec(text);
      if (m) {
        const span: [number, number] = [m.index, m.index + m[0].length];
        if (def.key === "anxiety" && out.some((o) => o.def.key === "gad")) break;
        if (def.key === "uri" && /flu shot|flu vaccine/i.test(text)) break;
        if (def.key === "lbp" && out.some((o) => o.def.key === "lbp")) break;
        if (taken.some(([a, b]) => span[0] >= a && span[1] <= b) && def.key !== "t2dm") break;
        if (negatedAt(text, m.index) && !/\bno (?:better|improvement)\b/i.test(text)) break;
        out.push({ def, index: m.index });
        taken.push(span);
        break;
      }
    }
  }
  return out;
}

const STATUS_PATTERNS: [RegExp, string][] = [
  [/\b(not (?:well )?controlled|uncontrolled|above (?:the |your )?goal|not at goal|higher than (?:we'd|I'd) like|still (?:high|elevated|up)|creeping up|worse|worsening|getting worse|flar(?:e|ing))\b/i, "not at goal"],
  [/\b(well[- ]controlled|under (?:good )?control|at goal|stable|looks great|looks good|right where we want|doing well|in range)\b/i, "stable"],
  [/\b(improv\w+|better|coming down|trending down|much better)\b/i, "improving"],
  [/\b(new|just (?:started|developed)|first time)\b/i, "new"],
];

const REASONING = /\b(I think|I suspect|likely|most likely|probably|consistent with|looks like|sounds like|my impression|this is (?:a|an|most)|doesn't (?:sound|look) like|less likely|rule out|reassuring|not concerned|concerned about|I'm worried|I am worried)\b/i;
const COUNSEL = /\b(exercise|walk(?:ing)?|diet|cut (?:back|down) on|salt|sodium|carbs|sugar|lose (?:some )?weight|weight loss|quit(?:ting)? smoking|stop smoking|sleep hygiene|screens? before bed|stretch(?:es|ing)?|ice|heat(?:ing pad)?|rest|fluids|hydrat\w+|honey|humidifier|saline|avoid|limit|caffeine|alcohol|breathing exercises|meditation|mindfulness|log (?:your|the) (?:blood pressure|sugars|readings)|check (?:your )?(?:blood pressure|sugars) at home|keep a (?:diary|log))\b/i;
const DIRECTIVE = /\b(I want you to|I'd like you to|try to|make sure|you should|I recommend|recommend|keep|let's|continue to|avoid|don't|do not|please|it's important|go ahead and|you can)\b/i;
const FOLLOW_UP = /\b(?:see you (?:back )?|follow(?:[- ]up)?|come back|check (?:back )?in|recheck|return|back in)\b[^.?!]*?\b(?:in|after|within)\s+((?:a|an|one|two|three|four|six|eight|twelve|\d+|a couple of|a few)\s+(?:day|week|month|year)s?)/i;
const PRECAUTION = /\b(if (?:it|you|things|anything|the \w+|your \w+)[^.]*?(?:worse|doesn't improve|not better|isn't better|don't improve|develop|notice|get)|go to the (?:ER|emergency)|call (?:us|the office|911)|come back (?:sooner|right away)|emergency room|bring (?:her|him|them) back)\b|^if\b[^.]*,\s*(?:call|come back|go to|bring|return|seek)\b/i;
const QUESTIONS_ASKED = /\b(any (?:other )?questions|anything else|what questions|does that (?:sound|make sense)|questions for me)\b/i;
const MEDS_ASKED = /\b(what (?:medications?|meds)|any (?:other )?(?:medications?|meds|supplements)|still taking|are you taking|how(?:'s| is| are) (?:the|your) \w+ (?:going|working)|taking (?:it|them) (?:every|regularly))\b/i;
const ALLERGY_ASKED = /\b(any (?:drug |medication )?allergies|allergic to anything|allergies to (?:any )?medications?)\b/i;
const SOCIAL_ASKED = /\b(do you smoke|smoking|tobacco|vape|alcohol|drink(?:ing)?|how much do you drink|work(?:ing)?|job|exercise|live with|drugs|marijuana|cannabis)\b/i;

const SOCIAL_PT = [
  { re: /\b(?:(?:one|two|three|four|five|\d+|a few|several)(?: or (?:one|two|three|four|five|\d+))? )?(?:coffees?|cups of coffee|energy drinks?|sodas?)\b[^.]*/i, label: "caffeine" },
  { re: /\b(?:I|she|he) (?:smoke|smokes|vape|vapes|chew)\b[^.]*|\b(?:half a pack|a pack|\d+ cigarettes)[^.]*|\bquit smoking[^.]*|\bnever smoked\b|\bdon't smoke\b/i, label: "tobacco" },
  { re: /\b(?:I|she|he) (?:drink|drinks)\b[^.]*|\b(?:a|one|two|three|\d+) (?:beers?|glasses of wine|drinks?)[^.]*|\bdon't drink\b|\bsocially\b/i, label: "alcohol" },
  { re: /\bI (?:work|teach|drive|am a|'m a)\b[^.]*|\bmy job\b[^.]*/i, label: "occupation" },
  { re: /\bI (?:walk|run|go to the gym|exercise|swim|bike)\b[^.]*/i, label: "activity" },
  { re: /\bI live (?:with|alone)\b[^.]*/i, label: "living" },
];

const FAMILY = /\b(?:my|her|his) (mom|mother|dad|father|brother|sister|grandmother|grandma|grandfather|grandpa|aunt|uncle)\b[^.]*?\b(had|has|died (?:of|from)|was diagnosed with|with)\b\s+([^,.;]+)/i;

const VITALS: { name: VitalFact["name"]; re: RegExp; fmt: (m: RegExpExecArray) => string; abnormal: (m: RegExpExecArray) => boolean }[] = [
  { name: "BP", re: /\b(?:blood pressure|BP)\b[^\d?]{0,30}?(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/i, fmt: (m) => `${m[1]}/${m[2]} mmHg`, abnormal: (m) => +m[1] >= 140 || +m[2] >= 90 || +m[1] < 90 },
  { name: "HR", re: /\b(?:heart rate|pulse)\b[^\d?]{0,20}?(\d{2,3})\b/i, fmt: (m) => `${m[1]} bpm`, abnormal: (m) => +m[1] > 100 || +m[1] < 50 },
  { name: "Temp", re: /\b(?:temp(?:erature)?)\b[^\d?]{0,20}?(\d{2,3}(?:\.\d)?)\b/i, fmt: (m) => `${m[1]} °F`, abnormal: (m) => +m[1] >= 100.4 },
  { name: "SpO2", re: /\b(?:oxygen(?: level| saturation)?|O2 sat|sats?|pulse ox)\b[^\d?]{0,20}?(\d{2,3})\s*(?:%|percent)?/i, fmt: (m) => `${m[1]}%`, abnormal: (m) => +m[1] < 94 },
  { name: "Weight", re: /\b(?:weigh(?:t|s|ing|ed)?)\b[^\d?]{0,20}?(\d{2,3}(?:\.\d)?)\s*(?:pounds|lbs?)/i, fmt: (m) => `${m[1]} lb`, abnormal: () => false },
  { name: "RR", re: /\b(?:respiratory rate|breathing rate)\b[^\d?]{0,20}?(\d{1,2})\b/i, fmt: (m) => `${m[1]} /min`, abnormal: (m) => +m[1] > 20 },
  { name: "BMI", re: /\bBMI\b[^\d?]{0,15}?(\d{2}(?:\.\d)?)/i, fmt: (m) => m[1], abnormal: (m) => +m[1] >= 30 },
];

const HOME_BP = /\b(?:home|at home|my (?:readings?|numbers?)|readings?)\b[^.?]*?\b(1\d\d|2\d\d)s?(?:\s*(?:over|\/)\s*(\d{2,3})s?)?/i;

const RESULTS: { name: string; re: RegExp; abnormal: (v: number) => boolean; unit: string }[] = [
  { name: "Hemoglobin A1c", re: /\bA1c\b[^\d?]{0,30}?(\d{1,2}(?:\.\d)?)\b/i, abnormal: (v) => v >= 6.5, unit: "%" },
  { name: "LDL", re: /\bLDL\b[^\d?]{0,25}?(\d{2,3})\b/i, abnormal: (v) => v >= 130, unit: "mg/dL" },
  { name: "Total cholesterol", re: /\b(?:total )?cholesterol\b[^\d?]{0,25}?(\d{3})\b/i, abnormal: (v) => v >= 200, unit: "mg/dL" },
  { name: "Creatinine", re: /\bcreatinine\b[^\d?]{0,25}?(\d(?:\.\d+)?)\b/i, abnormal: (v) => v > 1.3, unit: "mg/dL" },
  { name: "eGFR", re: /\b(?:eGFR|GFR|kidney function)\b[^\d?]{0,25}?(\d{2,3})\b/i, abnormal: (v) => v < 60, unit: "mL/min/1.73m²" },
  { name: "Potassium", re: /\bpotassium\b[^\d?]{0,25}?(\d(?:\.\d)?)\b/i, abnormal: (v) => v > 5.1 || v < 3.5, unit: "mmol/L" },
  { name: "TSH", re: /\bTSH\b[^\d?]{0,25}?(\d{1,2}(?:\.\d+)?)\b/i, abnormal: (v) => v > 4.5 || v < 0.4, unit: "mIU/L" },
  { name: "Vitamin D", re: /\bvitamin D\b[^\d?]{0,25}?(\d{1,3})\b/i, abnormal: (v) => v < 30, unit: "ng/mL" },
  { name: "Hemoglobin", re: /\bhemoglobin\b(?! a1c)[^\d?]{0,25}?(\d{1,2}(?:\.\d)?)\b/i, abnormal: (v) => v < 12, unit: "g/dL" },
];

const EXAM_CUE = /\b(take a (?:quick )?(?:listen|look)|let me (?:listen|look|check|feel|examine|press)|examine|exam(?:ination)?|deep breath|breathe in|say ah|follow my finger|lie back|press (?:here|on)|squeeze my|push against|straight leg)\b/i;
const EXAM_OBS = /\b(sounds?|looks?|feels?|is|are|seems?|appears?|no|not|clear|normal|red|swollen|tender|bulging|good|fine|ok(?:ay)?|intact|full|limited|decreased|positive|negative)\b/i;
const ABNORMAL = /\b(red|reddened|erythema(?:tous)?|bulging|tender(?:ness)?|wheez\w*|crackles|rales|rhonchi|swollen|swelling|enlarged|decreased|diminished|limited|positive|murmur|irregular|rash|elevated|exudate|effusion|spasm|pitting|droop|weak(?:ness)?|fluid)\b/i;
const PLAN_CUE = /\b(so here's (?:the|my) plan|here's what (?:I|we)|the plan|let's (?:start|go ahead|do|get|try|order|check)|I(?:'m going to| will| want to) (?:order|start|send|prescribe|refer|check|increase|bump)|what I'd like to do)\b/i;

function speakerOf(u: Utterance) {
  return u.speaker;
}

function toExamText(clause: string) {
  let t = clause.trim();
  t = t.replace(/^(okay|alright|all right|so|and|um|uh|good|great|hmm|now),?\s+/i, "");
  t = t.replace(/^(?:I (?:can )?(?:hear|see|feel)|it (?:looks|sounds|feels) like|I don't (?:hear|see|feel))\s+/i, (m) => (/don't/i.test(m) ? "No " : ""));
  t = t.replace(/^(?:you're|you are|she's|he's|she is|he is)\s+/i, "").replace(/\b(?:you're|you are)\b/gi, "patient is").replace(/\byour\b/gi, "").replace(/\byou\b/gi, "patient").replace(/^(?:her|his)\s+/i, "").replace(/\s{2,}/g, " ").trim();
  const specific: [RegExp, string][] = [
    [/^lungs? (?:sound|are|is) (?:nice and )?clear(?: on both sides)?/i, "Lungs clear to auscultation bilaterally"],
    [/^heart (?:sounds? )?(?:sounds )?(?:good|normal|regular|fine)/i, "Heart regular rate and rhythm"],
    [/^(?:no|not hearing any) murmurs?/i, "No murmurs"],
    [/^abdomen (?:is )?soft/i, "Abdomen soft"],
  ];
  for (const [re, rep] of specific) if (re.test(t)) t = t.replace(re, rep);
  return t.replace(/[.,;]+$/, "") ;
}

export function extractFacts(utterances: Utterance[], chart?: Chart, who?: { pronouns?: string; sex?: string }): Facts {
  const pr = pronounsFor(who?.pronouns ?? "", who?.sex ?? "X");
  const utts = utterances.filter((u) => !u.redacted).sort((a, b) => a.seq - b.seq);
  const symptoms = new Map<string, SymptomFact>();
  const meds: MedFact[] = [];
  const allergies: AllergyFact[] = [];
  let nkda: string[] | null = null;
  const vitals: VitalFact[] = [];
  const results: ResultFact[] = [];
  const exam: ExamFact[] = [];
  const problems = new Map<string, ProblemFact>();
  const orders: OrderFact[] = [];
  const counseling: PlanItem[] = [];
  let followUp: Facts["followUp"] = null;
  const returnPrecautions: Facts["returnPrecautions"] = [];
  const social: Facts["social"] = [];
  const family: Facts["family"] = [];
  const patientQuestions: Facts["patientQuestions"] = [];
  const asked = { meds: [] as string[], allergies: [] as string[], social: [] as string[], questions: [] as string[] };
  const languages = unique(utts.map((u) => u.lang ?? "en"));
  let interpreter = utts.some((u) => u.speaker === "other" && /\b(interpret|translat)/i.test(u.text));

  let activeSymptom: string | null = null;
  let currentProblem: string | null = null;
  let inExam = false;
  let lastMed: MedDef | null = null;
  let primarySymptom: string | null = null;
  let questionTarget: string | null = null;
  let pendingAnswer = false;
  let pendingAnswerSymptoms: string[] = [];
  let pendingQuestion: { u: Utterance; symptoms: { def: SymptomDef; negated: boolean }[]; kind: string | null } | null = null;

  const addSymptom = (def: SymptomDef, negated: boolean, u: Utterance) => {
    const existing = symptoms.get(def.key);
    if (existing) {
      if (!negated && existing.negated) existing.negated = false;
      if (!existing.evidence.includes(u.id)) existing.evidence.push(u.id);
      return existing;
    }
    const f: SymptomFact = { key: def.key, label: def.label, system: def.system, negated, evidence: [u.id], firstSeq: u.seq };
    symptoms.set(def.key, f);
    return f;
  };

  const touchProblem = (def: ConditionDef, u: Utterance, text: string) => {
    let p = problems.get(def.key);
    if (!p) {
      p = { key: def.key, label: def.label, icd10: def.icd10, def, chronic: def.chronic, assessed: false, evidence: [], firstSeq: u.seq, plan: [], reasoning: [] };
      problems.set(def.key, p);
    }
    if (!p.evidence.includes(u.id)) p.evidence.push(u.id);
    if (speakerOf(u) === "clinician") p.assessed = true;
    for (const [re, status] of STATUS_PATTERNS) {
      if (re.test(text)) {
        if (!(status === "new" && p.chronic)) p.status = status;
        break;
      }
    }
    return p;
  };

  const attachPlan = (item: PlanItem, hints: string[]) => {
    const target =
      hints.find((k) => problems.has(k)) ??
      (currentProblem && problems.has(currentProblem) ? currentProblem : null) ??
      hints.find((k) => chart?.problems.some((cp) => CONDITIONS.find((c) => c.key === k)?.patterns.some((re) => re.test(cp.name)))) ??
      null;
    if (target && problems.has(target)) {
      const p = problems.get(target)!;
      p.plan.push(item);
      p.assessed = true;
      return target;
    }
    if (target) {
      const def = CONDITIONS.find((c) => c.key === target);
      if (def) {
        const p: ProblemFact = { key: def.key, label: def.label, icd10: def.icd10, def, chronic: def.chronic, assessed: true, evidence: [...item.evidence], firstSeq: item.seq, plan: [item], reasoning: [] };
        problems.set(def.key, p);
        return def.key;
      }
    }
    return null;
  };

  for (let i = 0; i < utts.length; i++) {
    const u = utts[i];
    const text = u.text;
    const sp = speakerOf(u);

    pendingAnswer = !!pendingQuestion && sp === "patient";
    pendingAnswerSymptoms = pendingAnswer ? pendingQuestion!.symptoms.map((x) => x.def.key) : [];
    void pendingAnswer;
    if (sp === "clinician") questionTarget = null;
    if (pendingQuestion && sp === "patient") {
      const t = text.trim();
      if (pendingQuestion.symptoms.length) {
        const denies = DENY.test(t);
        const named = findSymptoms(t).filter((h) => pendingQuestion!.symptoms.some((s) => s.def.key === h.def.key));
        const affirms = AFFIRM.test(t) || (!denies && named.length > 0);
        if (denies || affirms) {
          const targets = affirms && named.length ? pendingQuestion.symptoms.filter((s) => named.some((n) => n.def.key === s.def.key && !n.negated)) : pendingQuestion.symptoms;
          for (const s of targets) {
            const f = addSymptom(s.def, !affirms, pendingQuestion.u);
            if (!f.evidence.includes(u.id)) f.evidence.push(u.id);
            if (affirms) f.negated = false;
          }
          if (affirms && named.length) {
            for (const s of pendingQuestion.symptoms) {
              if (!targets.includes(s) && /\b(but|just|only)\b/i.test(t)) addSymptom(s.def, true, pendingQuestion.u);
            }
          }
        }
      }
      if (pendingQuestion.kind === "allergy") {
        const named = Object.entries(ALLERGY_GROUPS).filter(([, re]) => re.test(t)).map(([g]) => g);
        if (named.length) {
          const reaction = /\b(hives|rash|swelling|anaphylaxis|trouble breathing|itch(?:ing|y)|nausea|throat (?:swelling|closing))\b/i.exec(t);
          for (const g of named) if (!allergies.some((a) => a.substance === g)) allergies.push({ substance: g, reaction: reaction?.[1]?.toLowerCase(), evidence: [pendingQuestion.u.id, u.id] });
        } else if (DENY.test(t)) nkda = [pendingQuestion.u.id, u.id];
      }
      if (pendingQuestion.kind === "attribute" && activeSymptom) {
        const f = symptoms.get(activeSymptom);
        if (f) {
          const d = firstMatch(DURATION, t) ?? undefined;
          if (d && !f.duration) { f.duration = d; f.evidence.push(u.id); }
        }
      }
      pendingQuestion = null;
    }

    if (sp === "clinician") {
      if (ALLERGY_ASKED.test(text)) asked.allergies.push(u.id);
      if (MEDS_ASKED.test(text)) asked.meds.push(u.id);
      if (SOCIAL_ASKED.test(text) && isQuestion(u)) asked.social.push(u.id);
      if (QUESTIONS_ASKED.test(text)) asked.questions.push(u.id);
    }

    if (sp === "patient" && /\?\s*$/.test(text)) patientQuestions.push({ text: toThirdPerson(text.trim(), pr), evidence: [u.id] });

    for (const clause of splitClauses(text)) {
      const clauseIsQuestion = sp === "clinician" && isQuestion({ ...u, text: clause });
      if (clauseIsQuestion) {
        const found = findSymptoms(clause).filter((h) => !h.negated);
        let kind: string | null = null;
        if (ALLERGY_ASKED.test(clause)) kind = "allergy";
        if (/\bhow long|when did (?:it|this|that|they) start|since when\b/i.test(clause)) kind = "attribute";
        pendingQuestion = { u, symptoms: found.map((f) => ({ def: f.def, negated: false })), kind };
        questionTarget = found.length === 1 ? found[0].def.key : null;
        if (found.length === 1 && !activeSymptom) activeSymptom = found[0].def.key;
        for (const c of conditionMentions(clause)) currentProblem = touchProblem(c.def, u, clause).key;
        const mmq = medMentions(clause);
        if (mmq.length) lastMed = mmq[mmq.length - 1].def;
        continue;
      }
      const allergyClause = /\ballerg|gives (?:me|her|him) (?:hives|a rash)|reaction to\b/i.test(clause);
      const conditional = /^\s*(?:if|when|in case|once)\b/i.test(clause);
      const hits = allergyClause ? [] : findSymptoms(clause);
      for (const h of hits) {
        if (sp === "clinician" && !h.negated && (conditional || !/\b(you (?:have|had|mentioned|said|told me|described)|you've been|you're having|your \w+ (?:is|has been))\b/i.test(clause))) continue;
        if (sp === "patient" && conditional) continue;
        addSymptom(h.def, h.negated, u);
        if (!h.negated && sp === "patient") {
          activeSymptom = h.def.key;
          if (!primarySymptom && !(pendingAnswerSymptoms.includes(h.def.key))) primarySymptom = h.def.key;
        }
      }

      if (sp === "patient" && !conditional) {
        const firstPos = hits.find((h) => !h.negated)?.def.key;
        const targetKey = firstPos ?? questionTarget ?? primarySymptom ?? activeSymptom;
        const f = targetKey ? symptoms.get(targetKey) : undefined;
        if (f && !f.negated) {
          const add = (k: keyof SymptomFact, v?: string) => {
            if (!v) return;
            if (!(f as unknown as Record<string, unknown>)[k]) {
              (f as unknown as Record<string, unknown>)[k] = v;
              if (!f.evidence.includes(u.id)) f.evidence.push(u.id);
            }
          };
          add("duration", firstMatch(DURATION, clause));
          add("onset", firstMatch(SINCE, clause));
          const sev = SEVERITY.exec(clause);
          if (sev) add("severity", sev[1] ? `${sev[1]}/10` : sev[2].toLowerCase());
          add("quality", firstMatch(QUALITY, clause)?.toLowerCase());
          if (/pain|ache|hurt/i.test(f.label)) {
            const loc = LOCATION.exec(clause);
            if (loc && /pain|ache|hurt|side|ear|knee|back/i.test(clause)) add("location", loc[0].toLowerCase());
          }
          add("radiation", firstMatch(RADIATION, clause)?.toLowerCase().replace(/\s+(?:sometimes|occasionally|at times|a lot|too)$/, ""));
          add("timing", firstMatch(TIMING, clause)?.toLowerCase());
          add("context", firstMatch(CONTEXT, clause)?.toLowerCase().replace(/^(?:ever )?since (?:i|she|he|they) (?:was|were) /, "").replace(/^when (?:i|she|he|they) (?:was|were) /, "").replace(/\bmy\b/g, pr.poss).replace(/\bi\b/g, pr.subj));
          const agg = AGGRAVATING.exec(clause);
          if (agg) { f.aggravating = unique([...(f.aggravating ?? []), gerundize(cleanPhrase(agg[1]))]); if (!f.evidence.includes(u.id)) f.evidence.push(u.id); }
          const rel = RELIEVING.exec(clause);
          if (rel && !/nothing/i.test(clause)) {
            let v = cleanPhrase(rel[1] ?? rel[2] ?? "");
            if (/^(it|that|this|which|and it|and that|)$/.test(v)) v = medMentions(clause)[0]?.def.name ?? "";
            if (v) { f.relieving = unique([...(f.relieving ?? []), v]); if (!f.evidence.includes(u.id)) f.evidence.push(u.id); }
          }
          const tried = TRIED.exec(clause);
          if (tried) {
            for (const med of medMentions(clause)) { f.tried = unique([...(f.tried ?? []), med.def.name]); if (!f.evidence.includes(u.id)) f.evidence.push(u.id); }
          }
        }
      }

      const conds = conditionMentions(clause);
      for (const c of conds) {
        const p = touchProblem(c.def, u, clause);
        currentProblem = p.key;
      }
      if (sp === "clinician" && REASONING.test(clause) && !isQuestion({ ...u, text: clause })) {
        const note = clinicianToNote(clause);
        const target = conds[0]?.def.key ?? currentProblem;
        if (target && problems.has(target)) {
          const p = problems.get(target)!;
          p.reasoning.push(u.id);
          p.plan.push({ type: "reasoning", text: note, evidence: [u.id], seq: u.seq });
        } else if (activeSymptom) {
          const sc = SYMPTOM_CODES[activeSymptom];
          if (sc) {
            const key = `sym_${activeSymptom}`;
            if (!problems.has(key)) {
              problems.set(key, { key, label: sc.label, icd10: sc.icd10, def: null, chronic: false, assessed: true, fromSymptom: true, evidence: [u.id], firstSeq: u.seq, plan: [], reasoning: [] });
            }
            const p = problems.get(key)!;
            p.plan.push({ type: "reasoning", text: note, evidence: [u.id], seq: u.seq });
            currentProblem = key;
          }
        }
      }

      const mm = medMentions(clause);
      if (!mm.length && sp === "patient" && lastMed && (SIDE_EFFECT.test(clause) || PT_NOT_TAKING.test(clause))) {
        const notTaking = PT_NOT_TAKING.test(clause);
        const detail = (notTaking ? firstMatch(PT_NOT_TAKING, clause) : firstMatch(SIDE_EFFECT, clause)) ?? "";
        const prior = [...meds].reverse().find((m) => m.name === lastMed!.name);
        meds.push({
          name: lastMed.name, cls: lastMed.cls, rx: lastMed.rx, def: lastMed,
          action: notTaking ? "not_taking" : "side_effect",
          dose: prior?.dose, frequency: prior?.frequency,
          note: (() => { const t3 = toThirdPerson(clause.replace(/^(honestly|but|and|so),?\s+/i, "").replace(/[.]+$/, ""), pr); return t3.charAt(0).toLowerCase() + t3.slice(1); })(),
          evidence: [u.id], seq: u.seq,
        });
        void detail;
      }
      if (mm.length) lastMed = mm[mm.length - 1].def;
      let prevAction: MedAction | null = null;
      for (let mi = 0; mi < mm.length; mi++) {
        const { def, index } = mm[mi];
        const prevEnd = mi > 0 ? mm[mi - 1].index + 1 : 0;
        const nextStart = mi + 1 < mm.length ? mm[mi + 1].index : clause.length;
        const seg = clause.slice(index, nextStart);
        const doseM = DOSE.exec(seg);
        const freq = normFreq(firstMatch(FREQ, seg));
        const pre = mi > 0 ? clause.slice(prevEnd, index).replace(/^\S*/, "") : clause.slice(Math.max(0, index - 70), index);
        const bareJoin = mi > 0 && /^[\s,]*(?:and|or|plus|along with|as well as)?[\s,]*(?:some\s+|a\s+|the\s+)?$/i.test(clause.slice(mm[mi - 1].index, index).replace(/^\S+/, "").replace(/\d+(?:\.\d+)?\s*(?:mg|milligrams?|mcg|units?)|(?:once|twice|three times) (?:a|per) day|daily|at bedtime|as needed[a-z\s]*|with food|for (?:\w+) (?:days|weeks)|every \w+/gi, ""));
        let action: MedAction | null = null;
        if (sp === "clinician") {
          if (STOP.test(pre) || /\bswitch(?:ing)? (?:you )?(?:off|from)\b/i.test(pre)) action = "stop";
          else if (INCREASE.test(pre) || INCREASE.test(seg.slice(0, 40))) action = "increase";
          else if (DECREASE.test(pre)) action = "decrease";
          else if (REFILL.test(pre) || REFILL.test(seg.slice(0, 30))) action = "refill";
          else if (CONTINUE.test(pre) || CONTINUE.test(seg.slice(0, 30))) action = "continue";
          else if (START.test(pre)) action = "start";
          else if (bareJoin && prevAction) action = prevAction;
          else if (/\b(on|taking|using)\b/i.test(pre)) action = "taking";
          if (action === "start" && chart?.medications.some((m) => m.name.toLowerCase().includes(def.name.split(" ")[0]))) action = /\b(start|prescrib|begin)\b/i.test(pre) ? "start" : "continue";
          if (/\bswitch(?:ing)? (?:you )?(?:over )?to\b/i.test(pre)) {
            const onIt = chart?.medications.some((m) => m.name.toLowerCase().includes(def.name.split(" ")[0])) || meds.some((m) => m.name === def.name && m.action === "taking");
            action = onIt ? "change" : "start";
          }
        } else if (sp === "patient") {
          if (PT_NOT_TAKING.test(clause)) action = "not_taking";
          else if (SIDE_EFFECT.test(clause)) action = "side_effect";
          else if (PT_TAKING.test(pre) || PT_TAKING.test(clause) || doseM) action = "taking";
          else if (TRIED.test(pre) || (bareJoin && prevAction)) action = "taking";
        }
        prevAction = action;
        if (!action) continue;
        if (action === "decrease" && sp === "clinician" && /\bswitch\b/i.test(pre)) action = "stop";
        const fact: MedFact = {
          name: def.name, cls: def.cls, rx: def.rx, def, action,
          dose: normDose(doseM),
          frequency: freq,
          evidence: [u.id],
          seq: u.seq,
        };
        if (action === "side_effect") fact.note = firstMatch(SIDE_EFFECT, clause);
        meds.push(fact);
        const form = /\b(extended[- ]release|ER|XR|XL)\b/i.test(seg.slice(0, 50)) ? " ER" : "";
        const withM = /\bwith (dinner|breakfast|food|meals|a meal)\b/i.exec(seg);
        if (withM && fact.frequency) fact.frequency = `${fact.frequency} with ${withM[1].toLowerCase()}`;
        if (sp === "clinician" && ["start", "stop", "increase", "decrease", "refill", "continue", "change"].includes(action)) {
          const verb = { start: "Start", stop: "Discontinue", increase: "Increase", decrease: "Decrease", refill: "Refill", continue: "Continue", change: "Change" }[action as "start"];
          const durM = /\bfor (\d+|one|two|three|five|seven|ten|fourteen) (days|weeks?)\b/i.exec(seg);
          const prn = /\bas needed(?: for (?:the )?([a-z\s]+?))?(?:[,.]|$| and| so)/i.exec(seg) ?? (action === "continue" || action === "start" ? /\b(?:as needed )?for (pain and fever|pain or fever|fever and pain|pain|fever)\b/i.exec(clause) : null);
          const titr = /\bthen (?:increase|go up|bump(?: it)? up)(?: to)? (\d+(?:\.\d+)?)\s*(mg|milligrams?|mcg)(?: (?:daily|a day|once a day))?/i.exec(seg);
          if (durM) fact.note = `for ${durM[1]} ${durM[2]}`;
          const tail = `${fact.frequency ? ` ${fact.frequency}` : ""}${prn && !fact.frequency?.includes("as needed") ? ` as needed${prn[1] ? ` for ${prn[1].trim()}` : ""}` : ""}${durM ? ` for ${durM[1]} ${durM[2]}` : ""}${titr ? `, then increase to ${titr[1]} ${titr[2].toLowerCase().startsWith("mc") ? "mcg" : "mg"}${fact.frequency ? ` ${fact.frequency}` : ""}` : ""}`;
          if (titr) fact.note = `${fact.note ? fact.note + "; " : ""}then ${titr[1]} mg`;
          const txt =
            action === "change"
              ? `Change ${def.name} to${form ? " extended-release" : ""} ${fact.dose ?? ""}${tail}.`.replace(/\s+/g, " ").replace(" .", ".")
              : `${verb} ${def.name}${form}${fact.dose ? ` ${action === "increase" || action === "decrease" ? "to " : ""}${fact.dose}` : ""}${tail}.`;
          if (action === "change" && form) fact.note = "extended-release";
          attachPlan({ type: "medication", ref: def.name, text: txt, evidence: [u.id], seq: u.seq }, MED_INDICATIONS[def.cls] ?? []);
        }
      }

      const allergyM = /\ballerg(?:ic|y|ies) to ([a-z][a-z\s-]{2,30}?)(?:[,.;]|\s+(?:and|it|which|that|so|because|gives|makes|I)\b|$)/i.exec(clause);
      if (allergyM && !negatedAt(clause, allergyM.index)) {
        const substance = allergyM[1].trim().toLowerCase();
        const reaction = /\b(hives|rash|swelling|anaphylaxis|trouble breathing|itch(?:ing|y)|nausea|throat (?:swelling|closing)|diarrhea|cough)\b/i.exec(text + " " + (utts[i + 1]?.text ?? ""));
        if (!allergies.some((a) => a.substance === substance)) allergies.push({ substance, reaction: reaction?.[1]?.toLowerCase(), evidence: [u.id] });
      }
      if (/\bno (?:known )?(?:drug |medication )?allergies\b|\bnot allergic to anything\b|\bNKDA\b/i.test(clause)) nkda = [u.id];

      for (const v of VITALS) {
        const m = v.re.exec(clause);
        if (m && !(v.name === "BP" && HOME_BP.test(clause) && /home|readings?/i.test(clause))) {
          if (!vitals.some((x) => x.name === v.name)) vitals.push({ name: v.name, value: v.fmt(m), evidence: [u.id], abnormal: v.abnormal(m) });
        }
      }
      const hb = HOME_BP.exec(clause);
      if (hb && /blood pressure|readings?|numbers?|BP/i.test(clause + (utts[i - 1]?.text ?? ""))) {
        if (!vitals.some((x) => x.name === "Home BP")) vitals.push({ name: "Home BP", value: hb[2] ? `${hb[1]}s/${hb[2]}s` : `${hb[1]}s systolic`, evidence: [u.id], abnormal: +hb[1] >= 135 });
      }
      for (const r of RESULTS) {
        const m = r.re.exec(clause);
        if (m && !/\b(?:check|order|draw|get)\b[^.]*$/i.test(clause.slice(0, m.index))) {
          const v = Number(m[1]);
          if (!Number.isNaN(v) && !results.some((x) => x.name === r.name)) results.push({ name: r.name, value: `${m[1]} ${r.unit}`, evidence: [u.id], abnormal: r.abnormal(v) });
        }
      }

      if (sp === "clinician") {
        if (EXAM_CUE.test(clause)) inExam = true;
        if (PLAN_CUE.test(clause) || REASONING.test(clause)) inExam = false;
        const sys = EXAM_SYSTEMS.find((s) => s.pattern.test(clause));
        const directive = /^(?:if|when|once|in case)\b/i.test(clause) || /^(?:let me|let's|I'm going to|I am going to|I will|I'll|I want to|go ahead)\b/i.test(clause) || /\b(I want you to|you should|we'll|we will|going to (?:order|start|send)|tell me if)\b/i.test(clause);
        const vitalTalk = VITALS.some((v) => v.re.test(clause));
        const looksObservational = EXAM_OBS.test(clause) && !isQuestion({ ...u, text: clause }) && !directive && !vitalTalk;
        const observeVerb = /\b(sounds?|looks?|feels?|appears?|seems?|is|are)\b/i.test(clause);
        if (sys && looksObservational && (inExam || observeVerb) && !REASONING.test(clause)) {
          const parts = clause.split(/,\s*(?:and\s+)?|\s+and\s+(?=(?:the |her |his |your )?(?:lungs?|heart|throat|ears?|left|right|abdomen|belly|pulses|reflexes|strength|sensation|skin|mood|thought|neck|feet|eyes|nose))/i).map((x) => x.trim()).filter(Boolean);
          const groups: { system: string; text: string[] }[] = [];
          for (const part of parts) {
            const ps = EXAM_SYSTEMS.find((s) => s.pattern.test(part));
            if (ps && (!groups.length || groups[groups.length - 1].system !== ps.system)) groups.push({ system: ps.system, text: [part] });
            else if (groups.length) groups[groups.length - 1].text.push(part);
            else groups.push({ system: sys.system, text: [part] });
          }
          for (const g of groups) {
            const t = toExamText(g.text.join(", "));
            if (t.split(/\s+/).length >= 2 && !exam.some((e) => e.text.toLowerCase() === t.toLowerCase())) {
              const abnormal = ABNORMAL.test(t) && !/^no\b|\bno (?:\w+ )?(?:tenderness|swelling|edema|murmurs?|wheez\w*|crackles|rash|redness|effusion|exudate)\b|non-?tender|not (?:red|swollen|tender)|\bnegative\b/i.test(t);
              exam.push({ system: g.system, text: t, abnormal, evidence: [u.id] });
            }
          }
        }

        for (const o of ORDERABLES) {
          if (o.patterns.some((re) => re.test(clause))) {
            const isResultTalk = RESULTS.some((r) => r.name.startsWith(o.name.split(" ")[0]) && r.re.test(clause)) && !/\b(check|order|draw|repeat|recheck|get|send)\b/i.test(clause);
            const isOrder = /\b(order|check|get|send|draw|do|run|repeat|recheck|schedule|give you|swab|test|want|need|going to|let's|we'll|update)\b/i.test(clause) && !isResultTalk;
            if (!isOrder) continue;
            const before = clause.slice(0, clause.search(o.patterns[0]) >= 0 ? clause.search(o.patterns[0]) : clause.length);
            if (/\b(don't|do not|no need|won't|not going to|hold off|not necessary|doesn't need|skip)\b/i.test(before)) continue;
            if (o.kind === "vaccine" && /\b(already|had|got)\b/i.test(clause) && !/\btoday\b/i.test(clause)) continue;
            if (!orders.some((x) => x.name === o.name)) {
              const when = /\b(today|now|in (?:\d+|one|two|three|four|six|a few|a couple of) (?:days?|weeks?|months?)|before (?:the|your) next visit|at (?:the|your) next visit|fasting)\b/i.exec(clause);
              const of: OrderFact = { kind: o.kind, name: o.name, detail: when ? when[1].toLowerCase() : "", cpt: o.cpt, evidence: [u.id], seq: u.seq };
              orders.push(of);
              of.problemKey = attachPlan({ type: "order", text: `${o.kind === "vaccine" ? "Administer" : "Order"} ${o.name}.`, evidence: [u.id], seq: u.seq }, ORDER_INDICATIONS[o.name] ?? []) ?? undefined;
            }
          }
        }
        for (const r of REFERRALS) {
          if (r.pattern.test(clause) && /\b(refer|send you|see (?:a|an|the)|referral|set you up|get you (?:in|set up)|connect you|follow up with|recommend (?:seeing|a))\b/i.test(clause)) {
            if (!orders.some((x) => x.name === `Referral to ${r.name}`)) {
              const of: OrderFact = { kind: "referral", name: `Referral to ${r.name}`, detail: "", evidence: [u.id], seq: u.seq };
              orders.push(of);
              of.problemKey = attachPlan({ type: "referral", text: `Refer to ${r.name}.`, evidence: [u.id], seq: u.seq }, ORDER_INDICATIONS[r.name.replace(/ /g, "_")] ?? []) ?? undefined;
            }
          }
        }
        if (COUNSEL.test(clause) && DIRECTIVE.test(clause) && !medMentions(clause).length && !isQuestion({ ...u, text: clause })) {
          const body = clause
            .replace(/^(okay|alright|so|and|also|um|now),?\s+/i, "")
            .replace(/^(?:I want you to|I'd like you to|try to|make sure (?:you|to)|you should|I recommend(?: that you)?|let's|please|it's important (?:to|that you)|go ahead and|you can)\s+/i, "")
            .replace(/\byour\b/gi, "their")
            .replace(/\byou\b/gi, "they")
            .replace(/[.!]+$/, "");
          const text2 = `Counseled to ${body.charAt(0).toLowerCase()}${body.slice(1)}.`;
          const item: PlanItem = { type: "counseling", text: text2, evidence: [u.id], seq: u.seq };
          counseling.push(item);
          attachPlan(item, COUNSEL_HINTS.filter(([re]) => re.test(clause)).flatMap(([, keys]) => keys));
        }
        const fu = FOLLOW_UP.exec(clause);
        if (fu && !followUp) {
          const interval = fu[1].toLowerCase().replace(/^a /, "1 ").replace(/^an /, "1 ");
          const n = wordToNumber(interval.split(" ")[0]);
          const unit = interval.split(" ").slice(-1)[0];
          const normalized = `${n ?? interval.split(" ")[0]} ${n === 1 ? unit.replace(/s$/, "") : unit.endsWith("s") ? unit : unit + "s"}`;
          followUp = { text: `Follow up in ${normalized}.`, interval: normalized, evidence: [u.id] };
        }
        if (PRECAUTION.test(clause) && !isQuestion({ ...u, text: clause })) {
          returnPrecautions.push({ text: precautionText(clause), evidence: [u.id] });
        }
      }

      if (sp === "patient") {
        for (const s of SOCIAL_PT) {
          const m = s.re.exec(clause);
          if (m && !social.some((x) => x.text.toLowerCase().includes(s.label))) {
            social.push({ text: `${s.label[0].toUpperCase()}${s.label.slice(1)}: ${socialPhrase(m[0])}`, evidence: [u.id] });
          }
        }
        const fam = FAMILY.exec(clause);
        if (fam) family.push({ text: `${fam[1][0].toUpperCase()}${fam[1].slice(1).toLowerCase()}: ${fam[3].trim()}`, evidence: [u.id] });
      }
      if (sp === "other" && /\b(interpret|translat)/i.test(clause)) interpreter = true;
    }
  }

  for (const stop of meds.filter((m) => m.action === "stop")) {
    const started = meds.find((m) => m.name === stop.name && m.action === "start" && m.seq <= stop.seq);
    const onChart = chart?.medications.some((m) => m.name.toLowerCase().includes(stop.name.split(" ")[0]));
    if (started && !onChart) {
      started.cancelled = true;
      stop.cancelled = true;
      for (const p of problems.values()) {
        const had = p.plan.some((it) => it.type === "medication" && it.ref === stop.name);
        p.plan = p.plan.filter((it) => !(it.type === "medication" && it.ref === stop.name));
        const conflicts = allergyConflicts(stop.name, [...allergies.map((a) => a.substance), ...(chart?.allergies ?? []).map((a) => a.substance)]);
        if (had && conflicts.length) {
          p.plan.push({ type: "reasoning", text: `${stop.name[0].toUpperCase()}${stop.name.slice(1)} avoided due to documented ${conflicts[0]} allergy.`, evidence: unique([...started.evidence, ...stop.evidence, ...allergies.flatMap((a) => a.evidence)]), seq: stop.seq });
        }
      }
    }
  }
  const merges: [string, string][] = [["anxiety", "gad"], ["pharyngitis", "strep"], ["uri", "flu"], ["uri", "covid"], ["tth", "migraine"]];
  for (const [from, into] of merges) {
    const a = problems.get(from);
    const b = problems.get(into);
    if (a && b) {
      b.evidence = unique([...b.evidence, ...a.evidence]);
      b.plan = [...a.plan, ...b.plan].sort((x, y) => x.seq - y.seq);
      b.firstSeq = Math.min(a.firstSeq, b.firstSeq);
      b.status ??= a.status;
      problems.delete(from);
    }
  }

  const symptomList = Array.from(symptoms.values()).sort((a, b) => a.firstSeq - b.firstSeq);
  const positives = symptomList.filter((s) => !s.negated);
  let chiefComplaint: Facts["chiefComplaint"] = null;
  if (positives.length) {
    const top = positives.map((s) => ({ s, score: s.evidence.length + (s.duration ? 2 : 0) + (s.severity ? 1 : 0) + (s.quality ? 1 : 0) - s.firstSeq * 0.4 })).sort((a, b) => b.score - a.score)[0].s;
    chiefComplaint = { key: top.key, label: top.label, evidence: top.evidence.slice(0, 2) };
  }

  if (chiefComplaint && !Array.from(problems.values()).some((p) => !p.chronic || p.status === "not at goal")) {
    const sc = SYMPTOM_CODES[chiefComplaint.key];
    const key = `sym_${chiefComplaint.key}`;
    if (sc && !problems.has(key)) {
      problems.set(key, { key, label: sc.label, icd10: sc.icd10, def: null, chronic: false, assessed: true, fromSymptom: true, evidence: chiefComplaint.evidence, firstSeq: symptoms.get(chiefComplaint.key)!.firstSeq, plan: [], reasoning: [] });
    }
  }

  const related = new Set(chiefComplaint ? CC_CONDITIONS[chiefComplaint.key] ?? [] : []);
  const problemList = Array.from(problems.values())
    .filter((p) => p.assessed || p.plan.length > 0 || p.evidence.length > 1)
    .sort((a, b) => {
      const w = (p: ProblemFact) => (related.has(p.key) || p.key === `sym_${chiefComplaint?.key}` ? 0 : 1) * 1000 + p.firstSeq;
      return w(a) - w(b);
    });

  if (problemList.some((p) => !p.fromSymptom && !p.chronic)) {
    for (let i = problemList.length - 1; i >= 0; i--) {
      const p = problemList[i];
      if (p.fromSymptom && p.plan.length === 0) problemList.splice(i, 1);
      else if (p.fromSymptom) {
        const real = problemList.find((q) => !q.fromSymptom && !q.chronic);
        if (real) {
          real.plan.push(...p.plan);
          real.plan.sort((a, b) => a.seq - b.seq);
          problemList.splice(i, 1);
        }
      }
    }
  }

  for (const p of problemList) {
    const joined = p.evidence.map((id) => utts.find((u) => u.id === id)?.text ?? "").join(" ");
    const spec = p.def?.specific?.find((s) => s.when.test(joined + " " + results.map((r) => `${r.name} ${r.value}`).join(" ")));
    if (spec) {
      p.icd10 = spec.icd10;
      p.label = spec.label;
    }
  }

  return {
    chiefComplaint,
    symptoms: symptomList,
    meds,
    allergies,
    nkda,
    vitals,
    results,
    exam,
    problems: problemList,
    orders,
    counseling,
    followUp,
    returnPrecautions,
    social,
    family,
    patientQuestions,
    asked,
    languages,
    interpreter,
  };
}

export function allergyConflicts(medName: string, allergySubstances: string[]) {
  const def = MEDICATIONS.find((m) => m.name === medName);
  if (!def?.allergyGroups) return [];
  const hits: string[] = [];
  for (const g of def.allergyGroups) {
    const re = ALLERGY_GROUPS[g];
    for (const a of allergySubstances) if (re?.test(a) || a.toLowerCase().includes(g)) hits.push(a);
  }
  return unique(hits);
}

export function guessSpeaker(text: string, prev: "clinician" | "patient" | null): "clinician" | "patient" {
  const t = text.trim();
  const clinicianCues = /\b(let me|let's|I'm going to (?:order|start|check|listen|examine|prescribe|refer|send)|I want you to|I'd like you to|take a deep breath|any (?:fever|chills|allergies|questions)|how long has|on a scale of|your (?:blood pressure|a1c|lungs|heart|labs|ears?|throat)|I recommend|the plan|we'll|go ahead and|sounds like|looks like|I think (?:this|it|you)|prescription|follow up)\b/i;
  const patientCues = /\b(I've been|I have been|I feel|I'm feeling|it hurts|my (?:back|head|chest|stomach|knee|throat|ear|son|daughter|husband|wife|job|mom)|I can't|I don't know|I take|I'm taking|I tried|I think it started|it started|thank you|okay,? doc|doctor)\b/i;
  const c = clinicianCues.test(t);
  const p = patientCues.test(t);
  if (c && !p) return "clinician";
  if (p && !c) return "patient";
  if (/\?\s*$/.test(t) && /^(how|what|when|where|any|do you|did you|have you|are you|is it|can you)\b/i.test(t)) return "clinician";
  if (prev) return prev === "clinician" ? "patient" : "clinician";
  return "clinician";
}
