import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { ccmEligible, draftCarePlan, monthCodes } from "@/lib/engine/ccm";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-ccm-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("chronic care management", () => {
  it("needs two chronic conditions and drafts goals for each", () => {
    const maria = DEMO_PATIENTS.find((d) => d.key === "gonzalez")!;
    expect(ccmEligible(maria.chart)).toEqual({ eligible: true, chronic: ["Essential hypertension", "Type 2 diabetes mellitus", "Hyperlipidemia"] });
    expect(ccmEligible({ problems: [{ name: "Acute bronchitis", icd10: "J20.9" }, { name: "Essential hypertension", icd10: "I10" }], medications: [], allergies: [] }).eligible).toBe(false);
    expect(draftCarePlan(maria.chart).map((p) => p.goal)).toEqual(["Blood pressure under 130/80", "Hemoglobin A1c under 7% (individualize for older adults)", "LDL at goal for cardiovascular risk"]);
  });

  it("turns monthly time into CCM codes", () => {
    expect(monthCodes([{ minutes: 15, role: "staff" }]).codes).toEqual([]);
    expect(monthCodes([{ minutes: 15, role: "staff" }, { minutes: 10, role: "staff" }]).codes.map((c) => c.cpt)).toEqual(["99490"]);
    expect(monthCodes([{ minutes: 65, role: "staff" }]).codes.map((c) => `${c.cpt}x${c.units}`)).toEqual(["99490x1", "99439x2"]);
    expect(monthCodes([{ minutes: 70, role: "staff" }]).codes.map((c) => `${c.cpt}x${c.units}`)).toEqual(["99490x1", "99439x2"]);
    expect(monthCodes([{ minutes: 35, role: "physician" }, { minutes: 20, role: "staff" }]).codes.map((c) => c.cpt)).toEqual(["99491"]);
  });

  it("enrolls with consent, logs staff time, and exports the month", async () => {
    const repo = await import("@/lib/server/repo");
    const ccm = await import("@/lib/server/ccm");
    const doc = await newMember("Dr. Care Manager");
    const nurse = await newMember("Nora RN", { orgId: doc.orgId, role: "nurse" });
    const scribe = await newMember("Sam Scribe", { orgId: doc.orgId, role: "scribe" });
    const d = DEMO_PATIENTS.find((x) => x.key === "gonzalez")!;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    expect((await ccm.ccmWorklist(doc)).eligible.map((e) => e.name)).toEqual(["Maria Gonzalez"]);
    await expect(ccm.enroll(nurse, { patientId: p.id })).rejects.toThrow("consented");
    await expect(ccm.enroll(scribe, { patientId: p.id, consentMethod: "verbal" })).rejects.toThrow("clinical staff");
    const id = await ccm.enroll(nurse, { patientId: p.id, consentMethod: "verbal", billingClinicianId: doc.id });
    await expect(ccm.enroll(doc, { patientId: p.id, consentMethod: "verbal" })).rejects.toThrow("already enrolled");
    await ccm.logTime(nurse, id, { minutes: 12, activity: "Patient phone call" });
    await ccm.logTime(nurse, id, { minutes: 14, activity: "Medication management" });
    await expect(ccm.logTime(nurse, id, { minutes: 300, activity: "x" })).rejects.toThrow("between 1 and 120");
    const wl = await ccm.ccmWorklist(doc);
    expect(wl.enrolled[0].totals).toMatchObject({ staffMinutes: 26, codes: [{ cpt: "99490", units: 1 }] });
    const csv = await ccm.monthExport(doc, wl.month);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain('"99490x1"');
    expect(csv).toContain('"I10 E11.9 E78.5"');
    await ccm.unenroll(doc, id);
    expect((await ccm.ccmWorklist(doc)).enrolled).toHaveLength(0);
  });
});
