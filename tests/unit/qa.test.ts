import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-qa-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("note QA", () => {
  it("samples new members' notes, collects rubric reviews, reports trust metrics, and runs engine regression cases", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const qa = await import("@/lib/server/qa");
    const { run } = await import("@/lib/db");
    const owner = await newMember("Dr. Olivia Owner");
    const doc = await newMember("Dr. New Hire", { orgId: owner.orgId, role: "clinician" });
    const viewer = await newMember("Quinn QA", { orgId: owner.orgId, role: "viewer" });
    const p = await repo.patients.create(doc, { mrn: "Q1", name: "Ruth Hale", dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), patientId: p.id, reason: "BP" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Your blood pressure is 152 over 94, so hypertension is not controlled. Let's start lisinopril 10 milligrams daily and check a basic metabolic panel.", tStart: 0, tEnd: 5 }]);
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const draft = (await repo.notes.latest(enc.id))!.content;
    await pipeline.saveNoteEdits(doc, enc.id, { ...draft, sections: draft.sections.map((s) => (s.key === "assessment_plan" ? { ...s, sentences: [...s.sentences, { id: "e1", text: "Low sodium diet discussed.", evidence: [], kind: "clinician" as const, support: "strong" as const, edited: true }] } : s)) }, "section.edited");
    await pipeline.signEncounter(doc, enc.id, { force: true });
    const list = await qa.reviews(viewer);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: "new user", status: "open", clinicianName: "Dr. New Hire" });
    expect(await qa.reviews(doc)).toHaveLength(1);
    const detail = await qa.reviewDetail(viewer, list[0].id);
    expect(detail.changes.find((c) => c.key === "assessment_plan")?.added).toContain("Low sodium diet discussed.");
    await expect(qa.submitReview(doc, list[0].id, {})).rejects.toThrow("can't review");
    await expect(qa.submitReview(viewer, list[0].id, { scores: { accuracy: 5 } })).rejects.toThrow("Score completeness");
    await qa.submitReview(viewer, list[0].id, { scores: { accuracy: 5, completeness: 4, attribution: 5, medications: 5, coding: 4 }, comment: "Good note." });
    const m = await qa.trustMetrics(owner);
    expect(m.clinicians.find((c) => c.name === "Dr. New Hire")).toMatchObject({ notes: 1, uneditedRate: 0, topSection: "Assessment & Plan" });
    expect(m.rubric.find((r) => r.key === "completeness")!.average).toBe(4);
    await qa.saveGolden(owner, enc.id, "HTN start");
    expect(await qa.runGolden(owner)).toEqual({ total: 1, passed: 1 });
    const c = (await qa.goldenCases(owner))[0];
    expect(c.expected.problems).toContain("I10");
    expect(c.expected.orders).toContain("Basic metabolic panel");
    await run("UPDATE golden_cases SET expected = ? WHERE id = ?", JSON.stringify({ ...c.expected, orders: [...c.expected.orders, "Lipid panel"] }), c.id);
    expect(await qa.runGolden(owner)).toEqual({ total: 1, passed: 0 });
    expect((await qa.goldenCases(owner))[0].lastRun!.missing).toEqual(["order Lipid panel"]);
  });
});
