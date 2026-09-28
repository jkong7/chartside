export type Credential = "" | "MD" | "DO" | "NP" | "PA" | "Resident" | "Fellow" | "Student" | "RN" | "MA";

export const CREDENTIALS: { value: Credential; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "MD", label: "MD" },
  { value: "DO", label: "DO" },
  { value: "NP", label: "Nurse practitioner" },
  { value: "PA", label: "Physician assistant" },
  { value: "Resident", label: "Resident" },
  { value: "Fellow", label: "Fellow" },
  { value: "Student", label: "Medical student" },
  { value: "RN", label: "RN" },
  { value: "MA", label: "Medical assistant" },
];

export const TRAINEES = new Set<Credential>(["Resident", "Fellow", "Student"]);
export const APPS = new Set<Credential>(["NP", "PA"]);
export const SUPERVISORS = new Set<Credential>(["MD", "DO"]);

export function needsCosign(credential: Credential | string | undefined, opts: { appsRequireCosign?: boolean } = {}) {
  const c = (credential ?? "") as Credential;
  return TRAINEES.has(c) || (!!opts.appsRequireCosign && APPS.has(c));
}

export type AttestationKey = "tp_present" | "tp_key_portions" | "tp_primary_care" | "app_review" | "student_verified";

export interface Attestation {
  key: AttestationKey;
  label: string;
  for: "trainee" | "app" | "student";
  modifier: "GC" | "GE" | null;
  text: (a: { supervisor: string; author: string }) => string;
  source: string;
}

export const ATTESTATIONS: Attestation[] = [
  {
    key: "tp_present",
    label: "Saw and evaluated the patient",
    for: "trainee",
    modifier: "GC",
    text: ({ supervisor, author }) => `I, ${supervisor}, saw and evaluated the patient, discussed the case with ${author}, and agree with the findings and plan as documented in the resident's note.`,
    source: "Medicare Claims Processing Manual, Ch. 12, §100.1.1",
  },
  {
    key: "tp_key_portions",
    label: "Present for key portions",
    for: "trainee",
    modifier: "GC",
    text: ({ supervisor, author }) => `I, ${supervisor}, was present with ${author} during the key and critical portions of this service, including the history, examination, and medical decision making, and I agree with the documentation.`,
    source: "Medicare Claims Processing Manual, Ch. 12, §100.1.1",
  },
  {
    key: "tp_primary_care",
    label: "Primary care exception",
    for: "trainee",
    modifier: "GE",
    text: ({ supervisor, author }) => `I, ${supervisor}, reviewed the history, examination, diagnoses, and plan with ${author} during or immediately after the visit under the primary care exception, and I agree with the documentation.`,
    source: "42 CFR 415.174",
  },
  {
    key: "student_verified",
    label: "Verified student documentation",
    for: "student",
    modifier: "GC",
    text: ({ supervisor, author }) => `I, ${supervisor}, personally performed or re-performed the physical examination and medical decision making and verified the history documented by the student ${author}. I agree with the note as written.`,
    source: "Medicare Claims Processing Manual, Ch. 12, §100.1.1.B",
  },
  {
    key: "app_review",
    label: "Reviewed APP note",
    for: "app",
    modifier: null,
    text: ({ supervisor, author }) => `I, ${supervisor}, reviewed the documentation by ${author} and agree with the assessment and plan.`,
    source: "State scope-of-practice collaborative agreement",
  },
];

export function attestationsFor(credential: Credential | string) {
  const c = credential as Credential;
  const kind = c === "Student" ? "student" : TRAINEES.has(c) ? "trainee" : "app";
  return ATTESTATIONS.filter((a) => a.for === kind);
}

export const PRIMARY_CARE_EXCEPTION_CODES = new Set(["99202", "99203", "99212", "99213", "G0402", "G0438", "G0439"]);

export type AddendumKind = "addendum" | "late_entry" | "correction" | "attestation";

export const ADDENDUM_KINDS: { value: Exclude<AddendumKind, "attestation">; label: string; help: string }[] = [
  { value: "addendum", label: "Addendum", help: "New information that became available after signing, such as a result or a callback." },
  { value: "late_entry", label: "Late entry", help: "Something that happened during the visit but was not documented at the time." },
  { value: "correction", label: "Correction", help: "Fixes an error in the signed note. The original text stays visible." },
];

export function addendumTitle(kind: AddendumKind) {
  return kind === "late_entry" ? "Late entry" : kind === "correction" ? "Correction" : kind === "attestation" ? "Attestation" : "Addendum";
}
