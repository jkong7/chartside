import type { CodingResult, ConsentRecord, Coverage, Encounter, Note, OmissionFlag, Patient, PatientSummary, StagedOrder, Template, Utterance } from "@/lib/types";

export interface Bundle {
  encounter: Encounter;
  patient: Patient | null;
  template: Template;
  templates: { id: string; name: string; specialty: string }[];
  consent: ConsentRecord | null;
  consentScript: { allParty: boolean; stateName: string; disclosure: string | null; script: string };
  state: string;
  utterances: Utterance[];
  note: { version: number; status: "draft" | "signed"; engine: string; content: Note; updatedAt: string } | null;
  artifacts: {
    coding?: CodingResult;
    coverage?: Coverage;
    omissions?: OmissionFlag[];
    summaries?: Record<string, PatientSummary>;
    letters?: { specialty: string; text: string }[];
    facts?: { chiefComplaint: { label: string } | null; interpreter: boolean; languages: string[] };
    share?: { token: string };
    interpreter?: import("@/lib/engine/interpreter").InterpreterCheck;
    claim?: import("@/lib/engine/billing").Claim;
    ehr_link?: import("@/lib/server/ehr").EhrLink;
    ehr_filing?: import("@/lib/server/ehr").EhrFiling;
    priorAuth?: import("@/lib/engine/priorauth").PaPacket[];
    signature?: import("@/lib/server/signoff").Signature;
    cosign?: import("@/lib/server/signoff").Cosign;
    intake?: import("@/lib/server/intake").IntakeRecord;
  };
  orders: StagedOrder[];
  audit: { id: string; action: string; detail: Record<string, unknown>; created_at: string }[];
  feedback: { section: string; rating: number }[];
  patientFlags: { id: string; item: string; comment: string; resolved: number; created_at: string }[];
  engine: { llm: boolean; model: string | null };
  audio: { chunks: number; bytes: number; durationMs: number; retentionDays: number };
  claim: import("@/lib/server/repo").ClaimRecord | null;
  addenda: import("@/lib/server/repo").Addendum[];
  tasks: import("@/lib/server/inbox").Task[];
  documents: { id: string; status: string }[];
  quality: import("@/lib/engine/quality").MeasureResult[];
  group: { id: string; title: string; members: number; role: "recording" | "member" } | null;
  admission: { id: string; unit: string; room: string; day: number; status: string; reason: string } | null;
  chain: { intact: boolean | null; checked: number; brokenAt: string | null };
  attestations: { key: string; label: string; modifier: string | null; source: string; preview: string }[];
  clinician: { id: string; name: string };
  access: { userId: string; role: string; capture: boolean; edit: boolean; sign: boolean; billingReview: boolean; cosign: boolean; addendum: boolean; share: boolean };
  colleagues: { id: string; name: string; role: string }[];
  limits: { recordingMinutes: number };
  agenda: import("@/lib/engine/agenda").AgendaItem[];
  speech: { provider: "deepgram" | "browser"; live: boolean; finalPass: boolean; wsUrl: string | null };
}

export interface Highlight {
  ids: string[];
  source?: string;
  nonce: number;
}
