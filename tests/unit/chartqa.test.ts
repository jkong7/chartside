import { describe, expect, it } from "vitest";
import { answerChart, buildCorpus } from "@/lib/engine/chartqa";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";

const maria = DEMO_PATIENTS.find((d) => d.key === "gonzalez")!;
const docs = buildCorpus({
  chart: maria.chart,
  notes: [{ encounterId: "enc1", date: "2026-09-28T09:00:00", title: "Diabetes follow-up", lines: ["Hemoglobin A1c: 8.4%.", "Increase metformin to 1000 mg twice daily.", "Refer to Ophthalmology for a diabetic eye exam."] }],
  records: [{ id: "rec1", name: "Outside colonoscopy report", date: "2026-08-01T00:00:00", text: "Colonoscopy performed 2024-03-02. Two small tubular adenomas removed. Repeat in 7 years." }],
});

describe("ask the chart", () => {
  it("answers last-date questions from structured data and outside records with citations", () => {
    const a = answerChart("When was her last colonoscopy?", docs);
    expect(a.mode).toBe("structured");
    expect(a.answer).toMatch(/^Most recent: .*Outside|^Most recent: Colonoscopy/);
    expect(a.citations.length).toBeGreaterThan(0);
    const m = answerChart("last mammogram", docs);
    expect(m.answer).toBe("Most recent: Screening mammogram: BI-RADS 1 on Nov 4, 2025.");
  });

  it("returns lists for allergies, medications with recent changes, and problems", () => {
    expect(answerChart("any allergies?", docs).answer).toBe("Allergies on file: sulfa (hives).");
    expect(answerChart("what meds is she on", docs).answer).toContain("Recent changes: Increase metformin to 1000 mg twice daily (Sep 28, 2026)");
    expect(answerChart("problem list", docs).answer).toContain("Type 2 diabetes mellitus");
  });

  it("builds a lab trend and falls back to search over prior notes", () => {
    expect(answerChart("A1c trend over time", docs).answer).toBe("A1c over time: 8.4% (Sep 10, 2026), 8.4% (Sep 28, 2026).");
    const s = answerChart("what did we decide about ophthalmology referral", docs);
    expect(s.answer).toContain("Refer to Ophthalmology");
    expect(s.citations[0].link).toBe("/encounters/enc1");
    expect(answerChart("zebra striping", docs).mode).toBe("none");
  });
});
