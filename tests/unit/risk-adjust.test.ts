import { describe, expect, it } from "vitest";
import { evidenceSuspects } from "@/lib/server/riskAdjust";
import { demo } from "./helpers";

describe("risk adjustment suspects", () => {
  it("suggests CKD from a low eGFR without a CKD diagnosis, and diabetes from an A1c, only as prompts", () => {
    const { patient } = demo("gonzalez");
    const s = evidenceSuspects(patient.chart, 58, "F");
    expect(s.map((x) => [x.condition, x.suggestedCode])).toEqual([["Chronic kidney disease stage 3a", "N18.31"]]);
    expect(s[0].evidence).toContain("confirm with a repeat");
    expect(s[0].hccs.length).toBeGreaterThan(0);
    const two = evidenceSuspects({ problems: [], medications: [], allergies: [], labs: [{ name: "eGFR", value: "41 mL/min/1.73m²", date: "2026-01-10" }, { name: "eGFR", value: "39 mL/min/1.73m²", date: "2026-06-01" }, { name: "Hemoglobin A1c", value: "7.1 %", date: "2026-06-01" }] }, 70, "M");
    expect(two.map((x) => x.suggestedCode)).toEqual(["N18.32", "E11.9"]);
    expect(two[0].evidence).toContain("2 results over 90 or more days");
    expect(evidenceSuspects({ problems: [{ name: "CKD stage 3a", icd10: "N18.31" }], medications: [], allergies: [], egfr: 50 }, 70, "M")).toEqual([]);
  });
});
