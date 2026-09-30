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
  voice?: VoiceFeatures | null;
  confidence?: number | null;
  source?: "live" | "final" | "typed";
}

export interface VoiceFeatures {
  pitch: number;
  centroid: number;
  energy: number;
  frames: number;
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
    detail?: "concise" | "standard" | "detailed";
    sensitive?: boolean;
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
  | "risk"
  | "interventions"
  | "response"
  | "therapy_time"
  | "ed_course"
  | "disposition"
  | "goals"
  | "group_topic"
  | "group_participation"
  | "therapy_services"
  | "therapy_measures"
  | "therapy_eval"
  | "procedure_note"
  | "ob_summary"
  | "ob_warning"
  | "ob_exam"
  | "ob_due"
  | "gdmt"
  | "well_screens"
  | "guidance"
  | "imm_due"
  | "awv"
  | "screening_schedule"
  | "acp"
  | "msk_exam"
  | "skin_exam"
  | "onc_history"
  | "onc_treatment"
  | "toxicity"
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
  source?: string;
}

export interface ChartMedication {
  name: string;
  dose?: string;
  frequency?: string;
  source?: string;
}

export interface ChartAllergy {
  substance: string;
  reaction?: string;
  source?: string;
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
  labs?: { name: string; value: string; date: string; flag?: "high" | "low" | "normal"; source?: string }[];
  social?: string[];
  family?: string[];
  priorVisits?: PriorVisit[];
  egfr?: number;
  coverage?: CoverageInfo;
  screenings?: { name: string; date: string; result?: string }[];
  immunizations?: { name: string; date: string }[];
  smoking?: "never" | "former" | "current";
  oncology?: OncologyProfile;
  pregnancy?: Pregnancy;
}

export interface Pregnancy {
  edd: string;
  gravida?: number;
  para?: number;
  rh?: "positive" | "negative";
}

export interface OncologyProfile {
  diagnosis: string;
  icd10?: string;
  stage?: string;
  tnm?: string | null;
  biomarkers?: string[];
  diagnosedOn?: string;
  regimens: { name: string; start: string; end?: string; cycles?: number; intent?: string; line?: string; reason?: string }[];
  toxicityHistory?: { date: string; cycle?: number; term: string; grade: number }[];
  ecogHistory?: { date: string; score: number }[];
}

export interface CoverageInfo {
  payer: "Medicare" | "Medicare Advantage" | "Medicaid" | "Commercial" | "Self-pay";
  plan?: string;
  memberId?: string;
  hccSegment?: string;
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
  externalSystem?: string | null;
  externalId?: string | null;
  phone?: string | null;
  email?: string | null;
  contactPref?: "sms" | "email" | "none" | null;
}

export type EncounterStatus = "scheduled" | "recording" | "paused" | "processing" | "review" | "signed";

export interface Encounter {
  id: string;
  userId: string;
  patientId: string | null;
  scheduledAt: string;
  visitType: "new" | "follow-up" | "acute" | "annual" | "telehealth" | "inpatient" | "progress" | "discharge" | "ed" | "group";
  reason: string;
  status: EncounterStatus;
  templateId: string | null;
  setting: "in-person" | "telehealth" | "inpatient" | "ed";
  inputLang: string;
  outputLang: string;
  startedAt: string | null;
  endedAt: string | null;
  durationS: number;
  signedAt: string | null;
  createdAt: string;
  externalSystem?: string | null;
  externalId?: string | null;
  admissionId?: string | null;
  locationId?: string | null;
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
  system: "ICD-10-CM" | "CPT" | "HCC" | "CMS-HCC V28";
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
  dxDetail?: DxDetail[];
  risk?: RiskSummary;
  reference?: { label: string; version: string }[];
  psychotherapyAddOn?: { code: string; minutes: number; evidence: string[] };
  tcm?: { code: "99495" | "99496" | null; daysAfterDischarge: number; met: string[]; unmet: string[]; episodeId: string };
  awv?: { subsequent: boolean; depressionScreened: boolean; acpMinutes: number | null; missing: string[] };
  wellChild?: { preventive: string; screens: { cpt: string; label: string; units: number }[] };
  prenatal?: { codes: { code: string; label: string }[]; globalPackage: boolean };
  procedures?: { procedures: import("./engine/procedures").ProcedureLine[]; drugs: import("./engine/procedures").DrugLine[] };
  therapy?: { discipline: "PT" | "OT" | "SLP"; evalCode: string | null; services: { cpt: string; label: string; minutes: number | null; timed: boolean; bundled: boolean; evidence: string[] }[] };
}

export interface RuleSource {
  set: string;
  version: string;
  ref?: string;
}

export interface DxIssue {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  source: RuleSource;
  codes?: string[];
}

export interface CdiQuery {
  id: string;
  code: string;
  problem?: string;
  question: string;
  options: { code: string; label: string }[];
  evidence: string[];
  source: RuleSource;
  answer?: { code: string | null; label: string; by: string; at: string } | null;
}

export interface DxDetail {
  code: string;
  label: string;
  official: string | null;
  billable: boolean;
  release: string | null;
  chapter: string | null;
  hccs: { hcc: string; label: string }[];
  issues: DxIssue[];
  query?: CdiQuery;
  problem?: string;
}

export interface RiskSummary {
  segment: string;
  segmentLabel: string;
  total: number;
  demographic: { variable: string; label: string; factor: number };
  hccs: { hcc: string; label: string; factor: number; codes: string[]; droppedBy?: string }[];
  interactions: { variable: string; label: string; factor: number }[];
  count: { variable: string; label: string; factor: number } | null;
  suspects: { code: string; label: string; hccs: { hcc: string; label: string }[]; delta: number; reason: string }[];
  recaptureYear: { captured: string[]; outstanding: string[] };
  note: string;
  source: RuleSource;
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
  kind: "max_words" | "format" | "abbreviate" | "drop_phrase" | "always_include" | "pronoun" | "order" | "heading";
  section: string;
  value: string;
  label: string;
  source: "learned" | "manual";
  support: number;
  active: boolean;
}
