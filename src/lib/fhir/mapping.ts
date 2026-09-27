import type { Chart, ChartAllergy, ChartMedication, ChartProblem } from "../types";

export interface FhirResource {
  resourceType: string;
  id?: string;
  [k: string]: unknown;
}

export interface FhirBundle {
  resourceType: "Bundle";
  entry?: { resource?: FhirResource }[];
}

interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

interface CodeableConcept {
  text?: string;
  coding?: Coding[];
}

export const ICD10 = "http://hl7.org/fhir/sid/icd-10-cm";
const LOINC = "http://loinc.org";

export function resources<T extends FhirResource = FhirResource>(b: FhirBundle | null | undefined, type: string): T[] {
  return (b?.entry ?? []).map((e) => e.resource).filter((r): r is T => !!r && r.resourceType === type);
}

function cc(c: unknown): CodeableConcept {
  return (c ?? {}) as CodeableConcept;
}

function textOf(c: unknown) {
  const x = cc(c);
  return x.text || x.coding?.find((k) => k.display)?.display || x.coding?.[0]?.code || "";
}

function codeIn(c: unknown, system: string) {
  return cc(c).coding?.find((k) => k.system === system)?.code;
}

export function mapPatient(p: FhirResource) {
  const names = (p.name as { use?: string; text?: string; given?: string[]; family?: string }[] | undefined) ?? [];
  const n = names.find((x) => x.use === "official") ?? names[0];
  const name = n?.text || [...(n?.given ?? []), n?.family].filter(Boolean).join(" ") || "Unknown patient";
  const ids = (p.identifier as { type?: CodeableConcept; value?: string; system?: string }[] | undefined) ?? [];
  const mrn = ids.find((i) => i.type?.coding?.some((c) => c.code === "MR") || /mrn|MR\b/i.test(i.type?.text ?? ""))?.value ?? ids[0]?.value ?? p.id ?? "";
  const g = String(p.gender ?? "");
  const comm = (p.communication as { language?: CodeableConcept; preferred?: boolean }[] | undefined) ?? [];
  const lang = (comm.find((c) => c.preferred) ?? comm[0])?.language;
  const code = (lang?.coding?.[0]?.code ?? lang?.text ?? "en").toLowerCase();
  return {
    name,
    dob: String(p.birthDate ?? "1900-01-01"),
    sex: (g === "female" ? "F" : g === "male" ? "M" : "X") as "F" | "M" | "X",
    mrn: String(mrn),
    language: /^es|spanish/.test(code) ? "es" : /^zh|chinese|mandarin/.test(code) ? "zh" : /^vi|vietnamese/.test(code) ? "vi" : "en",
  };
}

export function mapProblems(b: FhirBundle): ChartProblem[] {
  const out: ChartProblem[] = [];
  for (const c of resources(b, "Condition")) {
    const status = codeIn(c.clinicalStatus, "http://terminology.hl7.org/CodeSystem/condition-clinical");
    if (status && !["active", "recurrence", "relapse"].includes(status)) continue;
    const name = textOf(c.code).replace(/\s*\((?:disorder|finding|procedure|situation|morphologic abnormality|event)\)\s*$/i, "").trim();
    if (!name || out.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
    const onset = String(c.onsetDateTime ?? c.recordedDate ?? "");
    out.push({ name, icd10: codeIn(c.code, ICD10), since: onset ? onset.slice(0, 4) : undefined, status: status ?? "active" });
  }
  return out;
}

export function mapMedications(b: FhirBundle): ChartMedication[] {
  const out: ChartMedication[] = [];
  for (const m of resources(b, "MedicationRequest")) {
    if (m.status && !["active", "on-hold"].includes(String(m.status))) continue;
    const ref = m.medicationReference as { display?: string } | undefined;
    const name = textOf(m.medicationCodeableConcept) || ref?.display || "";
    if (!name) continue;
    const dosage = ((m.dosageInstruction as { text?: string }[] | undefined) ?? [])[0]?.text;
    out.push({ name: name.replace(/\s+/g, " ").trim(), frequency: dosage });
  }
  return out;
}

export function mapAllergies(b: FhirBundle): ChartAllergy[] {
  const out: ChartAllergy[] = [];
  for (const a of resources(b, "AllergyIntolerance")) {
    const status = codeIn(a.clinicalStatus, "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical");
    if (status && status !== "active") continue;
    const substance = textOf(a.code);
    if (!substance) continue;
    const reaction = ((a.reaction as { manifestation?: CodeableConcept[] }[] | undefined) ?? [])[0]?.manifestation?.[0];
    out.push({ substance: substance.toLowerCase(), reaction: reaction ? textOf(reaction).toLowerCase() : undefined });
  }
  return out;
}

const LAB_NAMES: Record<string, string> = {
  "4548-4": "Hemoglobin A1c",
  "17856-6": "Hemoglobin A1c",
  "13457-7": "LDL",
  "18262-6": "LDL",
  "2089-1": "LDL",
  "2093-3": "Total cholesterol",
  "33914-3": "eGFR",
  "48642-3": "eGFR",
  "62238-1": "eGFR",
  "98979-8": "eGFR",
  "2160-0": "Creatinine",
  "2823-3": "Potassium",
  "3016-3": "TSH",
  "718-7": "Hemoglobin",
  "1989-3": "Vitamin D",
};

function round(v: number) {
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return Math.round(v * 10 ** d) / 10 ** d;
}

function quantity(o: FhirResource) {
  const q = o.valueQuantity as { value?: number; unit?: string } | undefined;
  if (q?.value !== undefined) return { value: q.value, unit: q.unit ?? "" };
  if (typeof o.valueString === "string") return { value: Number.parseFloat(o.valueString), unit: "" };
  return null;
}

export function mapLabs(b: FhirBundle): NonNullable<Chart["labs"]> {
  const latest = new Map<string, NonNullable<Chart["labs"]>[number]>();
  const obs = resources(b, "Observation").sort((a, z) => String(z.effectiveDateTime ?? "").localeCompare(String(a.effectiveDateTime ?? "")));
  for (const o of obs) {
    const loinc = codeIn(o.code, LOINC);
    const name = (loinc && LAB_NAMES[loinc]) || textOf(o.code);
    const q = quantity(o);
    if (!name || !q || Number.isNaN(q.value) || latest.has(name)) continue;
    const interp = codeIn(((o.interpretation as CodeableConcept[] | undefined) ?? [])[0], "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation");
    const flag = interp && /^H/.test(interp) ? "high" : interp && /^L/.test(interp) ? "low" : interp === "N" ? "normal" : undefined;
    latest.set(name, { name, value: `${round(q.value)} ${q.unit}`.trim(), date: String(o.effectiveDateTime ?? o.issued ?? "").slice(0, 10), flag });
  }
  return Array.from(latest.values()).slice(0, 12);
}

export function mapVitals(b: FhirBundle): Record<string, string> {
  const v: Record<string, string> = {};
  const obs = resources(b, "Observation").sort((a, z) => String(z.effectiveDateTime ?? "").localeCompare(String(a.effectiveDateTime ?? "")));
  for (const o of obs) {
    const loinc = codeIn(o.code, LOINC);
    const comps = (o.component as { code?: CodeableConcept; valueQuantity?: { value?: number } }[] | undefined) ?? [];
    if ((loinc === "85354-9" || loinc === "55284-4") && !v.BP) {
      const sys = comps.find((c) => codeIn(c.code, LOINC) === "8480-6")?.valueQuantity?.value;
      const dia = comps.find((c) => codeIn(c.code, LOINC) === "8462-4")?.valueQuantity?.value;
      if (sys && dia) v.BP = `${Math.round(sys)}/${Math.round(dia)}`;
      continue;
    }
    const q = quantity(o);
    if (!q) continue;
    if (loinc === "8867-4" && !v.HR) v.HR = `${Math.round(q.value)}`;
    if (loinc === "29463-7" && !v.Weight) v.Weight = /kg/i.test(q.unit) ? `${Math.round(q.value * 2.20462)} lb` : `${Math.round(q.value)} lb`;
    if (loinc === "39156-5" && !v.BMI) v.BMI = `${Math.round(q.value * 10) / 10}`;
    if (loinc === "8310-5" && !v.Temp) v.Temp = /cel|C\b/i.test(q.unit) ? `${Math.round((q.value * 9) / 5 + 32)} °F` : `${q.value} °F`;
    if ((loinc === "2708-6" || loinc === "59408-5") && !v.SpO2) v.SpO2 = `${Math.round(q.value)}%`;
  }
  return v;
}

export function mapEncounter(e: FhirResource) {
  const period = e.period as { start?: string } | undefined;
  const reasons = (e.reasonCode as CodeableConcept[] | undefined) ?? [];
  const types = (e.type as CodeableConcept[] | undefined) ?? [];
  const cls = (e.class as Coding | undefined)?.code ?? "";
  return {
    start: period?.start ?? null,
    reason: textOf(reasons[0]) || textOf(types[0]) || "",
    telehealth: /VR|virtual/i.test(cls),
  };
}

export function buildChart(input: { conditions: FhirBundle; meds: FhirBundle; allergies: FhirBundle; labs: FhirBundle; vitals: FhirBundle }, prior?: Chart): Chart {
  const labs = mapLabs(input.labs);
  const egfr = labs.find((l) => l.name === "eGFR");
  return {
    ...(prior ?? {}),
    problems: mapProblems(input.conditions),
    medications: mapMedications(input.meds),
    allergies: mapAllergies(input.allergies),
    labs,
    vitals: mapVitals(input.vitals),
    egfr: egfr ? Number.parseFloat(egfr.value) : prior?.egfr,
    social: prior?.social ?? [],
    priorVisits: prior?.priorVisits ?? [],
  };
}

export const NOTE_TYPES: Record<string, { code: string; display: string }> = {
  progress: { code: "11506-3", display: "Progress note" },
  hp: { code: "34117-2", display: "History and physical note" },
  consult: { code: "11488-4", display: "Consult note" },
};

export function buildDocumentReference(input: { patientId: string; encounterId: string; text: string; title: string; date: string; authorRef?: string; kind?: keyof typeof NOTE_TYPES }) {
  const t = NOTE_TYPES[input.kind ?? "progress"];
  return {
    resourceType: "DocumentReference",
    status: "current",
    docStatus: "final",
    type: { coding: [{ system: LOINC, code: t.code, display: t.display }], text: t.display },
    category: [{ coding: [{ system: "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category", code: "clinical-note", display: "Clinical Note" }] }],
    subject: { reference: `Patient/${input.patientId}` },
    date: input.date,
    ...(input.authorRef ? { author: [{ reference: input.authorRef }] } : {}),
    description: input.title,
    content: [{ attachment: { contentType: "text/plain", data: Buffer.from(input.text, "utf8").toString("base64"), title: input.title } }],
    context: { encounter: [{ reference: `Encounter/${input.encounterId}` }] },
  };
}
