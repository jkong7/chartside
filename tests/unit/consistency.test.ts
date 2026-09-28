import { describe, expect, it } from "vitest";
import { checkConsistency } from "@/lib/engine/consistency";
import type { Note } from "@/lib/types";

const note = (sections: [string, string[]][]): Note => ({ sections: sections.map(([key, lines]) => ({ key, title: key, format: "bullets", sentences: lines.map((text, i) => ({ id: `${key}_${i}`, text, evidence: [], kind: "fact", support: "strong" })) })), meta: { engine: "local", templateId: "soap", generatedAt: "" } });
const pt = { dob: "1968-03-14", sex: "F" as const, pronouns: "she/her" };
const AT = new Date("2026-09-28T09:00:00");

describe("note consistency checks", () => {
  it("catches contradictions, sides, age, pronouns, and dose conflicts", () => {
    const issues = checkConsistency(note([
      ["subjective", ["Maria is a 48-year-old woman with right knee pain for 3 weeks.", "He reports the pain is worse on stairs.", "She denies chest pain."]],
      ["objective", ["Left knee with mild effusion."]],
      ["ros", ["Cardiovascular: positive for chest pain."]],
      ["ap", ["Continue lisinopril 10 mg daily.", "Lisinopril 20 mg daily for blood pressure."]],
    ]), pt, AT);
    expect(issues.map((i) => i.kind)).toEqual(["contradiction", "laterality", "age", "pronoun", "dose"]);
    expect(issues[0].message).toBe("Chest pain is documented as both present and denied.");
    expect(issues[2].message).toBe("The note says 48-year-old, but the patient is 58.");
    expect(issues[4].message).toContain("lisinopril appears with different doses (10 and 20)");
  });

  it("stays quiet for a consistent note, bilateral findings, and documented dose changes", () => {
    expect(checkConsistency(note([
      ["subjective", ["Maria is a 58-year-old woman with bilateral knee pain.", "She denies chest pain."]],
      ["objective", ["Right knee crepitus; left knee crepitus."]],
      ["ap", ["Increase lisinopril from 10 mg to 20 mg daily."]],
    ]), pt, AT)).toEqual([]);
  });

  it("ignores conditional return precautions", () => {
    expect(checkConsistency(note([
      ["subjective", ["He denies chest pain, shortness of breath, and wheezing."]],
      ["assessment_plan", ["Return precautions: return if a fever over 102, trouble breathing, or not better in 10 days."]],
    ]), { dob: "1990-01-01", sex: "M", pronouns: "he/him" }, AT)).toEqual([]);
  });
});
