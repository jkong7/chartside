export type Speaker = "clinician" | "patient" | "other";

export interface Utterance {
  id: string;
  seq: number;
  speaker: Speaker;
  speakerSource?: "auto" | "manual";
  text: string;
  tStart: number;
  tEnd: number;
  lang?: string;
  redacted?: boolean;
}

export type SentenceKind = "fact" | "default" | "carried" | "clinician" | "system";
export type Support = "strong" | "partial" | "none";

export interface NoteSentence {
  id: string;
  text: string;
  evidence: string[];
  kind: SentenceKind;
  support: Support;
  pending?: boolean;
  indent?: number;
  heading?: boolean;
  edited?: boolean;
}

export interface NoteSection {
  key: string;
  title: string;
  format: "bullets" | "paragraph";
  sentences: NoteSentence[];
}

export interface Note {
  sections: NoteSection[];
  meta: {
    engine: "local" | "claude";
    model?: string;
    templateId: string;
    generatedAt: string;
    warnings?: string[];
  };
}

export interface TemplateSection {
  key: string;
  title: string;
  kind: SectionKind;
  format: "bullets" | "paragraph";
  instructions?: string;
  required?: boolean;
}

export type SectionKind =
  | "chief_complaint"
  | "hpi"
  | "ros"
  | "pmh"
  | "medications"
  | "allergies"
  | "social"
  | "family"
  | "vitals"
  | "exam"
  | "results"
  | "assessment"
  | "plan"
  | "assessment_plan"
  | "subjective"
  | "objective"
  | "mental_status"
  | "patient_instructions"
  | "follow_up"
  | "custom";

export interface Template {
  id: string;
  userId: string | null;
  name: string;
  specialty: string;
  description: string;
  sections: TemplateSection[];
  style: TemplateStyle;
}

export interface TemplateStyle {
  verbosity?: "concise" | "standard" | "detailed";
  pronoun?: "patient" | "name";
  abbreviations?: boolean;
}

export interface ChartProblem {
  name: string;
  icd10?: string;
  since?: string;
  status?: string;
}

export interface ChartMedication {
  name: string;
  dose?: string;
  frequency?: string;
}

export interface ChartAllergy {
  substance: string;
  reaction?: string;
}

export interface PriorVisit {
  date: string;
  summary: string;
  plan: string[];
}

export interface Chart {
  problems: ChartProblem[];
  medications: ChartMedication[];
  allergies: ChartAllergy[];
  vitals?: Record<string, string>;
  labs?: { name: string; value: string; date: string; flag?: "high" | "low" | "normal" }[];
  social?: string[];
  family?: string[];
  priorVisits?: PriorVisit[];
  egfr?: number;
}

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: "F" | "M" | "X";
  pronouns: string;
  language: string;
  chart: Chart;
}

export type EncounterStatus = "scheduled" | "recording" | "paused" | "processing" | "review" | "signed";

export interface Encounter {
  id: string;
  userId: string;
  patientId: string | null;
  scheduledAt: string;
  visitType: "new" | "follow-up" | "acute" | "annual" | "telehealth";
  reason: string;
  status: EncounterStatus;
  templateId: string | null;
  setting: "in-person" | "telehealth";
  inputLang: string;
  outputLang: string;
  startedAt: string | null;
  endedAt: string | null;
  durationS: number;
  signedAt: string | null;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  encounterId: string;
  decision: "granted" | "declined";
  method: "verbal" | "written" | "patient-device";
  state: string;
  allParty: boolean;
  othersPresent: boolean;
  scriptVersion: string;
  statement: string;
  digest: string;
  createdAt: string;
}

export type OrderKind = "lab" | "imaging" | "medication" | "referral" | "procedure" | "vaccine" | "follow_up";

export interface OrderAlert {
  level: "info" | "warn" | "block";
  message: string;
}

export interface StagedOrder {
  id: string;
  kind: OrderKind;
  name: string;
  detail: string;
  status: "staged" | "accepted" | "rejected";
  evidence: string[];
  alerts: OrderAlert[];
  problem: string;
}

export interface CodeSuggestion {
  code: string;
  system: "ICD-10-CM" | "CPT" | "HCC";
  label: string;
  rationale: string;
  evidence: string[];
  confidence: number;
  problem?: string;
}

export interface MdmElement {
  level: "straightforward" | "low" | "moderate" | "high";
  reasons: string[];
  evidence: string[];
}

export interface CodingResult {
  diagnoses: CodeSuggestion[];
  em: {
    code: string;
    level: MdmElement["level"];
    patientType: "new" | "established";
    problems: MdmElement;
    data: MdmElement;
    risk: MdmElement;
    timeBased?: { minutes: number; code: string };
    auditRisk: { score: number; direction: "under" | "balanced" | "over"; notes: string[] };
  };
  hcc: CodeSuggestion[];
  cdi: { message: string; problem: string; evidence: string[] }[];
}

export interface CoverageItem {
  key: string;
  label: string;
  group: "hpi" | "history" | "safety" | "closing";
  met: boolean;
  evidence: string[];
  hint?: string;
}

export interface Coverage {
  chiefComplaint: string | null;
  items: CoverageItem[];
  score: number;
}

export interface OmissionFlag {
  id: string;
  category: "medication" | "symptom" | "allergy" | "vital" | "plan" | "order" | "exam";
  text: string;
  suggestion: string;
  section: string;
  evidence: string[];
}

export interface PatientSummary {
  lang: string;
  readingGrade: number;
  greeting: string;
  sections: { title: string; items: string[] }[];
  warnings: string[];
}

export interface StyleRule {
  id: string;
  kind: "max_words" | "format" | "abbreviate" | "drop_phrase" | "always_include" | "pronoun";
  section: string;
  value: string;
  label: string;
  source: "learned" | "manual";
  support: number;
  active: boolean;
}
