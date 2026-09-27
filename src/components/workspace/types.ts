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
  };
  orders: StagedOrder[];
  audit: { id: string; action: string; detail: Record<string, unknown>; created_at: string }[];
  feedback: { section: string; rating: number }[];
  patientFlags: { id: string; item: string; comment: string; resolved: number; created_at: string }[];
  engine: { llm: boolean; model: string | null };
}

export interface Highlight {
  ids: string[];
  source?: string;
  nonce: number;
}
