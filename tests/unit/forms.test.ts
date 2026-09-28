import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { autoMap } from "@/lib/engine/forms";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-forms-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function fillablePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const names = ["Employee Name", "Date of Birth", "Diagnosis", "ICD-10 Code", "Physician Name", "NPI", "Physician Signature Date", "Restrictions"];
  names.forEach((n, i) => form.createTextField(n).addToPage(page, { x: 50, y: 700 - i * 40, width: 300, height: 20 }));
  form.createCheckBox("Able to return to full duty").addToPage(page, { x: 50, y: 300, width: 12, height: 12 });
  return Buffer.from(await doc.save()).toString("base64");
}

describe("fillable PDF forms", () => {
  it("guesses field mappings from field names", () => {
    const m = autoMap(["Employee Name", "Date of Birth", "Diagnosis", "ICD-10 Code", "Physician Name", "NPI", "Physician Signature Date", "Restrictions"].map((name) => ({ name, type: "text" as const })));
    expect(m).toEqual({ "Employee Name": "patient.name", "Date of Birth": "patient.dob", Diagnosis: "dx.primary", "ICD-10 Code": "dx.code", "Physician Name": "clinician.name", NPI: "clinician.npi", "Physician Signature Date": "today", Restrictions: "none" });
  });

  it("uploads an AcroForm, fills it from the visit with overrides, and rejects non-fillable PDFs", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const fm = await import("@/lib/server/forms");
    const doc = await newMember("Dr. Form Filler");
    const org = (await repo.orgs.get(doc.orgId))!;
    await repo.orgs.update(org.id, { settings: { ...org.settings, billing: { npi: "1234567893" } } });
    const plain = await PDFDocument.create();
    plain.addPage();
    await expect(fm.uploadForm(doc, { name: "Plain", base64: Buffer.from(await plain.save()).toString("base64") })).rejects.toThrow("no fillable fields");
    await expect(fm.uploadForm(doc, { name: "Bad", base64: Buffer.from("hello").toString("base64") })).rejects.toThrow("isn't a PDF");
    const form = await fm.uploadForm(doc, { name: "Acme work status form", base64: await fillablePdf() });
    expect(form.fields).toHaveLength(9);
    expect(form.mapping["Able to return to full duty"]).toBe("none");
    await fm.saveMapping(doc, form.id, { ...form.mapping, "Able to return to full duty": "const.yes", Restrictions: "bogus" });
    const d = DEMO_PATIENTS.find((x) => x.key === "gonzalez")!;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: "2026-09-28T09:00:00", visitType: "follow-up", reason: d.visit.reason, templateId: "soap" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, d.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 5, tEnd: i * 5 + 4 })));
    await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 900 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const prev = await fm.previewFill(doc, enc.id, form.id);
    expect(prev.values).toMatchObject({ "Employee Name": "Maria Gonzalez", "Date of Birth": "03/14/1968", "Physician Name": "Dr. Form Filler", NPI: "1234567893", "Able to return to full duty": "true" });
    expect(prev.values["ICD-10 Code"]).toMatch(/^E11/);
    const { bytes } = await fm.fillForm(doc, enc.id, form.id, { Restrictions: "No lifting over 20 pounds for 2 weeks" }, false);
    const out = (await PDFDocument.load(bytes)).getForm();
    expect(out.getTextField("Employee Name").getText()).toBe("Maria Gonzalez");
    expect(out.getTextField("Restrictions").getText()).toBe("No lifting over 20 pounds for 2 weeks");
    expect(out.getCheckBox("Able to return to full duty").isChecked()).toBe(true);
    const flat = await PDFDocument.load((await fm.fillForm(doc, enc.id, form.id)).bytes);
    expect(flat.getForm().getFields()).toHaveLength(0);
  });
});
