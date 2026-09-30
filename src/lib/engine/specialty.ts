export const SPECIALTIES = ["Family Medicine", "Internal Medicine", "Pediatrics", "Psychiatry", "Psychotherapy", "Physical Therapy", "Occupational Therapy", "Speech-Language Pathology", "Chiropractic", "Emergency Medicine", "Hospital Medicine", "Oncology", "Obstetrics and Gynecology", "Urgent Care", "Orthopedics", "Dermatology", "Cardiology", "Other"] as const;

export type Specialty = (typeof SPECIALTIES)[number];

export interface SpecialtyProfile {
  specialty: Specialty;
  templateId: string;
  noteDetail: "concise" | "standard" | "detailed";
  noteStyle: string;
}

const PROFILES: Record<Specialty, Omit<SpecialtyProfile, "specialty">> = {
  "Family Medicine": { templateId: "soap", noteDetail: "standard", noteStyle: "SOAP note" },
  "Internal Medicine": { templateId: "soap", noteDetail: "standard", noteStyle: "SOAP note" },
  Pediatrics: { templateId: "peds_acute", noteDetail: "standard", noteStyle: "Pediatric sick visit" },
  Psychiatry: { templateId: "psych_med_mgmt", noteDetail: "standard", noteStyle: "Medication management note" },
  Psychotherapy: { templateId: "bh_dap", noteDetail: "standard", noteStyle: "Therapy note (DAP)" },
  "Physical Therapy": { templateId: "pt_daily", noteDetail: "concise", noteStyle: "Physical therapy daily note" },
  "Occupational Therapy": { templateId: "ot_daily", noteDetail: "concise", noteStyle: "Occupational therapy daily note" },
  "Speech-Language Pathology": { templateId: "soap", noteDetail: "concise", noteStyle: "SOAP note" },
  Chiropractic: { templateId: "msk", noteDetail: "concise", noteStyle: "Musculoskeletal visit" },
  "Emergency Medicine": { templateId: "ed_note", noteDetail: "standard", noteStyle: "Emergency department note" },
  "Hospital Medicine": { templateId: "inpatient_progress", noteDetail: "standard", noteStyle: "Inpatient progress note" },
  Oncology: { templateId: "onc_followup", noteDetail: "detailed", noteStyle: "Oncology treatment visit" },
  "Obstetrics and Gynecology": { templateId: "ob_prenatal", noteDetail: "standard", noteStyle: "Prenatal visit" },
  "Urgent Care": { templateId: "soap_concise", noteDetail: "concise", noteStyle: "Concise SOAP" },
  Orthopedics: { templateId: "ortho_visit", noteDetail: "standard", noteStyle: "Orthopedic visit" },
  Dermatology: { templateId: "derm_visit", noteDetail: "concise", noteStyle: "Dermatology visit" },
  Cardiology: { templateId: "cardiology_hf", noteDetail: "standard", noteStyle: "Heart failure follow-up" },
  Other: { templateId: "soap", noteDetail: "standard", noteStyle: "SOAP note" },
};

const TAXONOMY: [RegExp, Specialty][] = [
  [/^207P|^2080E|emergency/i, "Emergency Medicine"],
  [/^208M|hospitalist/i, "Hospital Medicine"],
  [/^2084P0800|^2084P0804|psychiatr|psychiatric\/mental health/i, "Psychiatry"],
  [/^103T|^101Y|^104|^106H|psycholog|counsel|social worker|marriage|family therap|mental health/i, "Psychotherapy"],
  [/^2251|physical therap/i, "Physical Therapy"],
  [/^225X|occupational therap/i, "Occupational Therapy"],
  [/^235Z|speech|language patholog/i, "Speech-Language Pathology"],
  [/^111N|chiropract/i, "Chiropractic"],
  [/^207RH|^207RX|hematolog|oncolog/i, "Oncology"],
  [/^207V|obstetric|gynecolog|midwi/i, "Obstetrics and Gynecology"],
  [/^2080|^363LP|pediatric/i, "Pediatrics"],
  [/^207X|^2082S|orthop|sports medicine/i, "Orthopedics"],
  [/^207N|dermatolog/i, "Dermatology"],
  [/^207RC|cardiolog|cardiovascular/i, "Cardiology"],
  [/urgent care/i, "Urgent Care"],
  [/^207R|internal medicine|adult health|gerontolog|geriatric/i, "Internal Medicine"],
  [/^207Q|^208D|^363LF|^363A|family|general practice|primary care|physician assistant|nurse practitioner/i, "Family Medicine"],
];

export function specialtyFromTaxonomy(desc: string | null | undefined, code?: string | null): Specialty {
  for (const probe of [code ?? "", desc ?? ""]) {
    if (!probe.trim()) continue;
    const hit = TAXONOMY.find(([re]) => re.test(probe.trim()));
    if (hit) return hit[1];
  }
  return "Other";
}

export function profileFor(specialty: string | null | undefined): SpecialtyProfile {
  const s = (SPECIALTIES as readonly string[]).includes(specialty ?? "") ? (specialty as Specialty) : specialtyFromTaxonomy(specialty);
  return { specialty: s, ...PROFILES[s] };
}

export function profileFromTaxonomy(desc: string | null | undefined, code?: string | null): SpecialtyProfile {
  return profileFor(specialtyFromTaxonomy(desc, code));
}
