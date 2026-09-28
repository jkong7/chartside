export interface FormField {
  name: string;
  type: "text" | "checkbox" | "dropdown" | "radio" | "other";
  options?: string[];
}

export const SOURCES: { key: string; label: string; match: RegExp }[] = [
  { key: "patient.name", label: "Patient full name", match: /^(?!.*(?:physician|provider|doctor|employer|emergency|parent|guardian)).*(?:patient|member|employee|student|insured)?.*\bname\b(?!.*(?:first|last))/i },
  { key: "patient.first", label: "Patient first name", match: /\bfirst\b.*name|\bfname\b|given/i },
  { key: "patient.last", label: "Patient last name", match: /\blast\b.*name|\blname\b|surname|family name/i },
  { key: "patient.dob", label: "Date of birth", match: /\bdob\b|birth/i },
  { key: "patient.age", label: "Age", match: /^age$|\bage\b(?!ncy)/i },
  { key: "patient.sex", label: "Sex", match: /\bsex\b|gender/i },
  { key: "patient.mrn", label: "MRN", match: /\bmrn\b|medical record/i },
  { key: "patient.phone", label: "Patient phone", match: /phone|tel/i },
  { key: "patient.email", label: "Patient email", match: /e-?mail/i },
  { key: "visit.date", label: "Visit date", match: /(?:visit|exam|service|appointment|evaluation)\s*date|date of (?:visit|exam|service)|^date$/i },
  { key: "today", label: "Today's date", match: /\btoday\b|date signed|signature date|sign(?:ed)? date/i },
  { key: "clinician.name", label: "Clinician name", match: /physician|provider|doctor|practitioner|clinician|examiner/i },
  { key: "clinician.npi", label: "NPI", match: /\bnpi\b/i },
  { key: "org.name", label: "Practice name", match: /practice|clinic|facility|office name/i },
  { key: "dx.primary", label: "Primary diagnosis", match: /diagnos[ie]s|condition|reason/i },
  { key: "dx.code", label: "Primary ICD-10 code", match: /icd|dx code/i },
  { key: "dx.all", label: "All diagnoses with codes", match: /diagnoses|problems/i },
  { key: "meds.list", label: "Medication list", match: /medications?|meds|prescriptions/i },
  { key: "allergies.list", label: "Allergies", match: /allerg/i },
  { key: "plan.summary", label: "Plan", match: /plan|treatment|recommend/i },
  { key: "followup", label: "Follow-up", match: /follow[- ]?up|return/i },
  { key: "vitals.bp", label: "Blood pressure", match: /\bbp\b|blood pressure/i },
  { key: "vitals.weight", label: "Weight", match: /weight/i },
  { key: "const.yes", label: "Checked / Yes", match: /$^/ },
  { key: "none", label: "Leave blank", match: /$^/ },
];

export function autoMap(fields: FormField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const n = f.name.replace(/[_\-.[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    if (f.type === "checkbox") {
      out[f.name] = "none";
      continue;
    }
    const hit = SOURCES.find((s) => s.match.test(n));
    out[f.name] = hit?.key ?? "none";
  }
  return out;
}

export type FormContext = Record<string, string>;

export function resolve(mapping: Record<string, string>, ctx: FormContext) {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const [field, key] of Object.entries(mapping)) {
    if (key === "none") continue;
    const v = key === "const.yes" ? "true" : ctx[key] ?? "";
    if (v) values[field] = v;
    else missing.push(field);
  }
  return { values, missing };
}
