import { describe, expect, it } from "vitest";
import { CALCULATORS, prefill, suggestedCalculators, type CalcResult } from "@/lib/engine/calculators";
import { demo } from "./helpers";

const run = (id: string, v: Record<string, number | boolean | string>) => CALCULATORS.find((c) => c.id === id)!.compute(v) as CalcResult;

describe("clinical calculators", () => {
  it("matches published CKD-EPI 2021 values", () => {
    expect(run("egfr", { scr: 1.0, age: 60, sex: "F" }).value).toBe(64);
    expect(run("egfr", { scr: 1.2, age: 50, sex: "M" }).value).toBe(74);
    expect(run("egfr", { scr: 3.5, age: 70, sex: "M" }).noteText).toContain("GFR category G4");
    expect(CALCULATORS.find((c) => c.id === "egfr")!.compute({ age: 50 })).toEqual({ missing: ["Serum creatinine"] });
  });

  it("scores stroke, bleeding, pneumonia, strep, and PE risk", () => {
    expect(run("cha2ds2vasc", { age: 78, sex: "F", htn: true, diabetes: true })).toMatchObject({ value: 5, band: "high" });
    expect(run("cha2ds2vasc", { age: 50, sex: "F" })).toMatchObject({ value: 1, band: "low" });
    expect(run("cha2ds2vasc", { age: 66, sex: "M" })).toMatchObject({ value: 1, band: "moderate" });
    expect(run("hasbled", { elderly: true, drugs: true, stroke: true }).band).toBe("high");
    expect(run("curb65", { confusion: true, bun: true, rr: true, bp: true, age65: true }).interpretation).toContain("27.8%");
    expect(run("centor", { age: 10, fever: true, nocough: true, nodes: true, exudate: true }).value).toBe(5);
    expect(run("centor", { age: 50, nocough: true }).value).toBe(0);
    expect(run("wells_pe", { dvt: true, likely: true, hr: true }).noteText).toBe("Wells PE score 7.5 (PE likely).");
  });

  it("scores PHQ-9, PHQ-2, GAD-7, and flags a positive item 9", () => {
    const all = (n: number, k: number) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`q${i + 1}`, String(n)]));
    const p = run("phq9", { ...all(1, 9), q9: "1" });
    expect(p).toMatchObject({ value: 9 });
    expect(p.alert).toContain("suicide risk assessment");
    expect(p.noteText).toContain("***");
    expect(run("phq9", all(2, 9)).interpretation).toContain("Moderately severe");
    expect(run("phq2", { q1: "2", q2: "1" }).noteText).toBe("PHQ-2 depression screening completed; score 3/6 (positive, PHQ-9 to follow).");
    expect(run("gad7", all(3, 7))).toMatchObject({ value: 21, band: "high" });
  });

  it("computes BMI and weight-based pediatric doses with adult caps", () => {
    expect(run("bmi", { weight: 180, height: 66 }).value).toBe(29);
    const amox = run("peds_dose", { weight: 20, drug: "amox_high" });
    expect(amox.display).toBe("900 mg per dose (11.3 mL of 400 mg/5 mL)");
    const apap = run("peds_dose", { weight: 80, drug: "acetaminophen" });
    expect(apap).toMatchObject({ value: 800, band: "moderate" });
  });

  it("prefills inputs from the chart and the visit and suggests relevant calculators", () => {
    const { patient, facts } = demo("gonzalez");
    const ctx = { patient, facts, at: new Date("2026-09-28T12:00:00") };
    const c = prefill("cha2ds2vasc", ctx);
    expect(c.values).toMatchObject({ age: 58, sex: "F", htn: true, diabetes: true });
    expect(c.sources.htn).toBe("problem list");
    const b = prefill("bmi", ctx);
    expect(b.values.weight).toBeGreaterThan(100);
    expect(suggestedCalculators(ctx)).toContain("egfr");
    const kid = demo("ramirez");
    expect(suggestedCalculators({ patient: kid.patient, facts: kid.facts, at: new Date("2026-09-28T12:00:00") })).toContain("peds_dose");
  });
});

describe("calculator prefill word boundaries", () => {
  it("does not read 'Essential hypertension' as a TIA", () => {
    const r = prefill("cha2ds2vasc", { patient: { dob: "1968-03-14", sex: "F", chart: { problems: [{ name: "Essential hypertension", icd10: "I10" }], medications: [], allergies: [] } }, facts: null, at: new Date("2026-09-28") });
    expect(r.values.stroke).toBeUndefined();
    expect(r.values.htn).toBe(true);
  });
});

describe("evidence library", () => {
  it("retrieves the right guideline for common questions and answers with sources", async () => {
    const { searchEvidence } = await import("@/lib/engine/evidence");
    const { localAssist } = await import("@/lib/engine/assist");
    expect(searchEvidence("When should colorectal cancer screening start?")[0].entry.id).toBe("uspstf-crc");
    expect(searchEvidence("lung cancer screening pack-year criteria")[0].entry.id).toBe("uspstf-lung");
    expect(searchEvidence("A1c goal for type 2 diabetes")[0].entry.id).toBe("ada-glycemic");
    expect(searchEvidence("shingles vaccine age")[0].entry.id).toBe("cdc-adult-vax");
    expect(searchEvidence("first-line antibiotic for ear infection in children")[0].entry.id).toBe("aap-aom");
    expect(searchEvidence("quantum chromodynamics")).toEqual([]);
    const r = localAssist("What is the USPSTF recommendation for breast cancer screening?", null, []);
    expect(r.reply).toContain("Biennial screening mammography for women 40 to 74");
    expect(r.sources?.[0]).toMatchObject({ org: "USPSTF", year: 2024 });
    const t = localAssist("what did she say about the flu vaccine?", null, [{ id: "u1", seq: 0, speaker: "patient", text: "I already got my flu vaccine at the pharmacy.", tStart: 0, tEnd: 1 }]);
    expect(t.sources).toBeUndefined();
    expect(t.citations).toEqual(["u1"]);
  });
});
