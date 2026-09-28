import { describe, expect, it } from "vitest";
import { buildAgenda, markAddressed } from "@/lib/engine/agenda";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";

describe("visit agenda", () => {
  it("prioritizes urgent flags, treatment, abnormal results, last plan, open loops, gaps, and risk suspects", () => {
    const maria = DEMO_PATIENTS.find((d) => d.key === "gonzalez")!;
    const items = buildAgenda({
      chart: maria.chart,
      newPatient: false,
      intakeFlags: [{ level: "urgent", text: "Reports chest pain" }, { level: "info", text: "Current tobacco use" }],
      quality: [{ id: "cms2", ecqm: "CMS2", title: "Depression screening", status: "gap", reason: "No PHQ-9 this year", evidence: [], actions: [] }],
      openTasks: [{ kind: "referral", title: "Confirm Ophthalmology appointment was scheduled", dueAt: "2026-07-01T00:00:00Z" }],
      suspects: [{ condition: "Chronic kidney disease stage 3a", suggestedCode: "N18.31", evidence: "eGFR 58" }],
      at: new Date("2026-09-28T09:00:00"),
    });
    expect(items[0]).toMatchObject({ category: "urgent", text: "Reports chest pain" });
    expect(items.map((i) => i.category)).toEqual(["urgent", "results", "results", "follow_up", "follow_up", "follow_up", "open_loop", "gap", "risk"]);
    expect(items.find((i) => i.key === "lab:Hemoglobin A1c")!.text).toBe("Review Hemoglobin A1c 8.4 % (high, 2026-09-10)");
    expect(items.find((i) => i.category === "open_loop")!.why).toBe("Open task, overdue");
    const marked = markAddressed(items, "Your A1c came back at 8.4. Let's also get you to the eye doctor.", ["gap:cms2"]);
    expect(marked.filter((i) => i.addressed).map((i) => i.key)).toEqual(["lab:Hemoglobin A1c", "plan:Recheck A1c in 3 months", "plan:Diabetic eye exam referral", "gap:cms2"]);
  });

  it("adds new-patient items and oncology treatment decisions", () => {
    const items = buildAgenda({ chart: { problems: [], medications: [], allergies: [], oncology: { diagnosis: "Colon cancer", regimens: [{ name: "FOLFOX", start: "2026-06-01", cycles: 5 }], toxicityHistory: [{ date: "2026-09-14", cycle: 5, term: "Peripheral sensory neuropathy", grade: 2 }] } }, newPatient: true });
    expect(items.map((i) => i.text)).toEqual(["FOLFOX cycle 6: decide to treat, hold, or dose reduce", "Reassess peripheral sensory neuropathy (grade 2 last cycle)", "Confirm past medical, surgical, family, and social history", "Reconcile medications and allergies"]);
  });
});
