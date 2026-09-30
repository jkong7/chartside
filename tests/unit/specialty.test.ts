import { describe, expect, it } from "vitest";
import { profileFor, profileFromTaxonomy, specialtyFromTaxonomy } from "@/lib/engine/specialty";
import { SYSTEM_TEMPLATES } from "@/lib/engine/templates";

describe("NPI taxonomy to specialty template", () => {
  it.each([
    ["Family Medicine", null, "Family Medicine", "soap"],
    ["Internal Medicine", null, "Internal Medicine", "soap"],
    ["Internal Medicine, Cardiovascular Disease", null, "Cardiology", "cardiology_hf"],
    ["Internal Medicine, Hematology & Oncology", null, "Oncology", "onc_followup"],
    ["Physical Therapist", null, "Physical Therapy", "pt_daily"],
    ["Occupational Therapist", null, "Occupational Therapy", "ot_daily"],
    ["Speech-Language Pathologist", null, "Speech-Language Pathology", "soap"],
    ["Chiropractor", null, "Chiropractic", "msk"],
    ["Counselor, Mental Health", null, "Psychotherapy", "bh_dap"],
    ["Social Worker, Clinical", null, "Psychotherapy", "bh_dap"],
    ["Marriage & Family Therapist", null, "Psychotherapy", "bh_dap"],
    ["Psychiatry & Neurology, Psychiatry", null, "Psychiatry", "psych_med_mgmt"],
    ["Nurse Practitioner, Psychiatric/Mental Health", null, "Psychiatry", "psych_med_mgmt"],
    ["Nurse Practitioner, Pediatrics", null, "Pediatrics", "peds_acute"],
    ["Nurse Practitioner, Family", null, "Family Medicine", "soap"],
    ["Physician Assistant, Medical", null, "Family Medicine", "soap"],
    ["Emergency Medicine", null, "Emergency Medicine", "ed_note"],
    ["Obstetrics & Gynecology", null, "Obstetrics and Gynecology", "ob_prenatal"],
    ["Dermatology", null, "Dermatology", "derm_visit"],
    ["Orthopaedic Surgery", null, "Orthopedics", "ortho_visit"],
    ["Hospitalist", null, "Hospital Medicine", "inpatient_progress"],
    ["Something Unusual", "225100000X", "Physical Therapy", "pt_daily"],
    ["Veterinarian", null, "Other", "soap"],
  ])("%s maps to %s", (desc, code, specialty, template) => {
    const p = profileFromTaxonomy(desc, code);
    expect(p.specialty).toBe(specialty);
    expect(p.templateId).toBe(template);
  });

  it("only picks templates that exist", () => {
    const ids = new Set(SYSTEM_TEMPLATES.map((t) => t.id));
    for (const d of ["Family Medicine", "Chiropractor", "Physical Therapist", "Psychiatry", "Counselor", "Dermatology", "Cardiology", "Oncology", "Hospitalist", "Emergency Medicine", "Pediatrics", "Occupational Therapist", "Obstetrics"]) expect(ids.has(profileFromTaxonomy(d).templateId)).toBe(true);
  });

  it("treats a dropdown choice and a taxonomy the same way", () => {
    expect(profileFor("Chiropractic").templateId).toBe("msk");
    expect(profileFor("Chiropractor").templateId).toBe("msk");
    expect(profileFor(undefined).specialty).toBe("Other");
    expect(specialtyFromTaxonomy("", "")).toBe("Other");
    expect(profileFor("Physical Therapy").noteDetail).toBe("concise");
  });
});
