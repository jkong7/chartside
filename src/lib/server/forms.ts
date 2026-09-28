import { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField } from "pdf-lib";
import { all, get, now, run, uid } from "../db";
import { autoMap, resolve, SOURCES, type FormContext, type FormField } from "../engine/forms";
import { ageFrom } from "../engine/text";
import type { CodingResult } from "../types";
import { assertCan, Invalid } from "./policy";
import { factsFor } from "./pipeline";
import { artifacts, audit, encounters, j, orgs, users, type User } from "./repo";

const MAX_BYTES = 3 * 1024 * 1024;

interface Row {
  id: string;
  name: string;
  pdf: string;
  fields: string;
  mapping: string;
  created_at: string;
}

export interface FormTemplate {
  id: string;
  name: string;
  fields: FormField[];
  mapping: Record<string, string>;
  createdAt: string;
}

const toForm = (r: Row): FormTemplate => ({ id: r.id, name: r.name, fields: j(r.fields, []), mapping: j(r.mapping, {}), createdAt: r.created_at });

export const forms = {
  list: async (u: User) => (await all<Row>("SELECT id, name, '' AS pdf, fields, mapping, created_at FROM form_templates WHERE org_id = ? ORDER BY name", u.orgId)).map(toForm),
  get: async (u: User, id: string) => {
    const r = await get<Row>("SELECT id, name, '' AS pdf, fields, mapping, created_at FROM form_templates WHERE org_id = ? AND id = ?", u.orgId, id);
    return r ? toForm(r) : undefined;
  },
  pdf: async (u: User, id: string) => (await get<{ pdf: string }>("SELECT pdf FROM form_templates WHERE org_id = ? AND id = ?", u.orgId, id))?.pdf,
};

export async function readFields(bytes: Uint8Array): Promise<FormField[]> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new Invalid("That file isn't a readable PDF");
  }
  const fields = doc.getForm().getFields();
  if (!fields.length) throw new Invalid("This PDF has no fillable fields. Upload a fillable (AcroForm) PDF.");
  return fields.map((f) => {
    const type: FormField["type"] = f instanceof PDFTextField ? "text" : f instanceof PDFCheckBox ? "checkbox" : f instanceof PDFDropdown ? "dropdown" : f instanceof PDFRadioGroup ? "radio" : "other";
    return { name: f.getName(), type, options: f instanceof PDFDropdown || f instanceof PDFRadioGroup ? f.getOptions() : undefined };
  });
}

export async function uploadForm(u: User, input: { name?: string; base64?: string }) {
  assertCan(u, "org.manage");
  const name = (input.name ?? "").trim();
  if (!name) throw new Invalid("Name the form");
  const bytes = Buffer.from(input.base64 ?? "", "base64");
  if (!bytes.length) throw new Invalid("Choose a PDF");
  if (bytes.length > MAX_BYTES) throw new Invalid("PDFs must be under 3 MB");
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Invalid("That file isn't a PDF");
  const fields = await readFields(new Uint8Array(bytes));
  const id = uid("frm_");
  await run("INSERT INTO form_templates (id, org_id, name, pdf, fields, mapping, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, name.slice(0, 120), bytes.toString("base64"), JSON.stringify(fields), JSON.stringify(autoMap(fields)), u.id, now());
  await audit.log(u, null, "form.uploaded", { formId: id, fields: fields.length });
  return (await forms.get(u, id))!;
}

export async function saveMapping(u: User, id: string, mapping: Record<string, string>) {
  assertCan(u, "org.manage");
  const f = await forms.get(u, id);
  if (!f) throw new Error("Form not found");
  const keys = new Set(SOURCES.map((s) => s.key));
  const clean = Object.fromEntries(f.fields.map((x) => [x.name, keys.has(mapping[x.name]) ? mapping[x.name] : f.mapping[x.name] ?? "none"]));
  await run("UPDATE form_templates SET mapping = ? WHERE id = ?", JSON.stringify(clean), id);
  return (await forms.get(u, id))!;
}

export async function deleteForm(u: User, id: string) {
  assertCan(u, "org.manage");
  await run("DELETE FROM form_templates WHERE org_id = ? AND id = ?", u.orgId, id);
}

async function context(u: User, encId: string): Promise<FormContext> {
  const enc = await encounters.get(u, encId);
  if (!enc) throw new Error("Encounter not found");
  const { facts, patient } = await factsFor(u, enc);
  const clin = (await users.byId(enc.userId)) ?? u;
  const org = await orgs.get(u.orgId);
  const coding = await artifacts.get<CodingResult>(encId, "coding");
  const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const dx = coding?.diagnoses ?? [];
  const bp = facts.vitals.find((v) => v.name === "BP")?.value ?? patient?.chart.vitals?.BP ?? "";
  const weight = facts.vitals.find((v) => v.name === "Weight")?.value ?? patient?.chart.vitals?.Weight ?? "";
  return {
    "patient.name": patient?.name ?? "",
    "patient.first": patient?.name.split(" ")[0] ?? "",
    "patient.last": patient?.name.split(" ").slice(1).join(" ") ?? "",
    "patient.dob": patient ? fmt(patient.dob) : "",
    "patient.age": patient ? String(ageFrom(patient.dob, new Date(enc.scheduledAt))) : "",
    "patient.sex": patient?.sex === "F" ? "Female" : patient?.sex === "M" ? "Male" : "",
    "patient.mrn": patient?.mrn ?? "",
    "patient.phone": patient?.phone ?? "",
    "patient.email": patient?.email ?? "",
    "visit.date": fmt(enc.scheduledAt),
    today: fmt(new Date().toISOString()),
    "clinician.name": clin.name,
    "clinician.npi": (org?.settings.billing as { npi?: string } | undefined)?.npi ?? "",
    "org.name": org?.name ?? "",
    "dx.primary": dx[0]?.label ?? facts.problems[0]?.label ?? "",
    "dx.code": dx[0]?.code ?? facts.problems[0]?.icd10 ?? "",
    "dx.all": dx.map((d) => `${d.label} (${d.code})`).join("; "),
    "meds.list": (patient?.chart.medications ?? []).map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" ")).join("; "),
    "allergies.list": (patient?.chart.allergies ?? []).map((a) => a.substance).join(", ") || "No known drug allergies",
    "plan.summary": facts.problems.flatMap((p) => p.plan.filter((x) => x.type !== "reasoning").map((x) => x.text)).slice(0, 6).join(" "),
    followup: facts.followUp?.text ?? "",
    "vitals.bp": bp,
    "vitals.weight": weight,
  };
}

export async function previewFill(u: User, encId: string, formId: string) {
  const f = await forms.get(u, formId);
  if (!f) throw new Error("Form not found");
  const { values, missing } = resolve(f.mapping, await context(u, encId));
  return { form: f, values, missing };
}

export async function fillForm(u: User, encId: string, formId: string, overrides: Record<string, string> = {}, flatten = true) {
  assertCan(u, "clinical.edit");
  const { form, values } = await previewFill(u, encId, formId);
  const b64 = await forms.pdf(u, formId);
  const doc = await PDFDocument.load(Buffer.from(b64!, "base64"));
  const pdfForm = doc.getForm();
  const final = { ...values, ...Object.fromEntries(Object.entries(overrides).filter(([k]) => form.fields.some((x) => x.name === k)).map(([k, v]) => [k, String(v).slice(0, 2000)])) };
  for (const field of form.fields) {
    const v = final[field.name];
    if (v === undefined || v === "") continue;
    const pf = pdfForm.getField(field.name);
    if (pf instanceof PDFTextField) pf.setText(v);
    else if (pf instanceof PDFCheckBox) (/^(true|yes|on|x|1)$/i.test(v) ? pf.check() : pf.uncheck());
    else if (pf instanceof PDFDropdown && pf.getOptions().includes(v)) pf.select(v);
    else if (pf instanceof PDFRadioGroup && pf.getOptions().includes(v)) pf.select(v);
  }
  if (flatten) pdfForm.flatten();
  const bytes = await doc.save();
  await audit.log(u, encId, "form.filled", { formId, name: form.name, fields: Object.keys(final).length });
  return { bytes, name: form.name };
}
