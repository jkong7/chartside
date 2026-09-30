import { describe, expect, it } from "vitest";
import { approxDate, buildVisitRecap, recapText } from "@/lib/engine/visitRecap";
import { extractFacts } from "@/lib/engine/extract";
import { demo } from "./helpers";

describe("patient visit recap", () => {
  const { facts } = demo("gonzalez");
  const r = buildVisitRecap(facts, { clinician: "Dr. Lee", recordedAt: new Date("2026-09-30T15:40:00Z") });

  it("puts diagnoses in lay words next to the clinical term", () => {
    expect(r.diagnoses.map((d) => d.plain)).toEqual(expect.arrayContaining(["high blood pressure", "type 2 diabetes"]));
    expect(r.headline).toMatch(/^You saw Dr\. Lee about your/);
    expect(r.headline).not.toMatch(/—/);
  });

  it("lists medicine changes first, in plain words", () => {
    const lis = r.meds.find((m) => m.name === "lisinopril")!;
    expect(lis.change).toBe("Higher dose");
    expect(lis.text).toMatch(/Take more lisinopril: now 20 mg/);
    expect(r.meds.find((m) => m.name === "empagliflozin")?.change).toBe("New");
    const keep = r.meds.findIndex((m) => m.change === "Keep taking");
    if (keep >= 0) expect(r.meds.slice(keep).every((m) => m.change === "Keep taking")).toBe(true);
  });

  it("gives next steps with approximate dates and questions for next time", () => {
    const fu = r.nextSteps.find((n) => /follow-up visit in 3 months/.test(n.text))!;
    expect(fu.when).toBe("in December 2026");
    expect(r.nextSteps.some((n) => /lab test/i.test(n.text) && n.when?.startsWith("around"))).toBe(true);
    expect(r.questions.some((q) => /side effects .*empagliflozin/.test(q))).toBe(true);
    expect(r.watchFor.at(-1)).toBe("Call 911 for any emergency.");
    expect(r.source).toBe("local");
  });

  it("reads at a plain level and renders as text for the PDF", () => {
    expect(r.readingGrade).toBeLessThan(10);
    const t = recapText(r, "Ask about the eye doctor");
    expect(t).toContain("QUESTIONS TO ASK NEXT TIME");
    expect(t).toContain("- Ask about the eye doctor");
  });

  it("still gives something useful when little was said", () => {
    const empty = buildVisitRecap(extractFacts([{ id: "u0", seq: 0, speaker: "patient", text: "Hi there.", tStart: 0, tEnd: 1 }]));
    expect(empty.headline).toBe("Here is what we heard in your visit.");
    expect(empty.questions.length).toBeGreaterThan(0);
  });

  it("turns spoken intervals into dates", () => {
    const from = new Date("2026-09-30T12:00:00Z");
    expect(approxDate("2 weeks", from)).toBe("around Wednesday, October 14");
    expect(approxDate("three months", from)).toBe("in December 2026");
    expect(approxDate("soon", from)).toBeNull();
  });
});
