import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prebillReview } from "@/lib/engine/prebill";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-prebill-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const snap = (results: Record<string, string>, vitals: Record<string, string> = {}) => ({ date: "", vitals: Object.fromEntries(Object.entries(vitals).map(([k, v]) => [k, { value: v, evidence: [] }])), results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { value: v, abnormal: false, evidence: [] }])), meds: [], problems: [] });

describe("inpatient pre-bill review", () => {
  it("raises KDIGO, sodium, hypoxia, anemia, SIRS, and heart failure specificity queries and assigns POA", () => {
    const r = prebillReview([
      { day: 1, kind: "admission", snapshot: snap({ Creatinine: "1.1 mg/dL", Sodium: "131 mmol/L", Hemoglobin: "12.4 g/dL", WBC: "14.2 K/uL" }, { HR: "112 bpm", SpO2: "88%" }), problems: [{ icd10: "I50.9", label: "Heart failure, unspecified" }, { icd10: "J18.9", label: "Pneumonia" }] },
      { day: 2, kind: "progress", snapshot: snap({ Creatinine: "1.6 mg/dL", Sodium: "133 mmol/L", Hemoglobin: "10.1 g/dL" }), problems: [{ icd10: "I50.9", label: "Heart failure, unspecified" }, { icd10: "J18.9", label: "Pneumonia" }, { icd10: "R26.81", label: "Unsteadiness on feet" }] },
    ]);
    expect(r.queries.map((q) => [q.key, q.severity])).toEqual([["aki", "CC"], ["hypoNa", "CC"], ["arf", "MCC"], ["abla", "CC"], ["sepsis", "MCC"], ["hf", "MCC"]]);
    expect(r.queries[0].indicators).toEqual(["Creatinine 1.1 (day 1), 1.6 (day 2)", "Rise of 0.3 mg/dL or more within 48 hours (KDIGO)"]);
    expect(r.queries.every((q) => q.options.includes("Clinically undetermined") || q.key === "hf")).toBe(true);
    expect(r.poa.map((p) => `${p.code}:${p.poa}`)).toEqual(["I50.9:Y", "J18.9:Y", "R26.81:N"]);
  });

  it("stays quiet when conditions are documented", () => {
    const r = prebillReview([
      { day: 1, kind: "admission", snapshot: snap({ Creatinine: "1.1 mg/dL" }), problems: [] },
      { day: 2, kind: "progress", snapshot: snap({ Creatinine: "1.6 mg/dL" }), problems: [{ icd10: "N17.9", label: "Acute kidney failure, unspecified" }] },
    ]);
    expect(r.queries).toEqual([]);
  });

  it("lets only the attending answer, and adds a clarification addendum for a confirmed diagnosis", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const ip = await import("@/lib/server/inpatient");
    const pb = await import("@/lib/server/prebill");
    const doc = await newMember("Dr. Hospitalist");
    const coder = await newMember("Cody CDI", { orgId: doc.orgId, role: "coder" });
    const p = await repo.patients.create(doc, { mrn: "88001", name: "Ruth Baker", dob: "1948-05-05", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const day = (n: number) => new Date(Date.now() - (2 - n) * 86400000);
    const { admission, encounterId } = await ip.admit(doc, { patientId: p.id, unit: "5 East", room: "501", reason: "Pneumonia", admitAt: day(0).toISOString() });
    const run = async (encId: string, lines: string[]) => {
      const enc = (await repo.encounters.get(doc, encId))!;
      await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
      await repo.utterances.append(encId, lines.map((t, i) => ({ speaker: "clinician" as const, text: t, tStart: i * 5, tEnd: i * 5 + 4 })));
      await repo.encounters.update(doc, encId, { status: "processing", durationS: 1800 });
      await pipeline.processEncounter(doc, encId, { engine: "local" });
      await pipeline.signEncounter(doc, encId, { force: true });
    };
    await run(encounterId, ["Your creatinine is 1.0 and sodium 138.", "This is community acquired pneumonia, so we'll start ceftriaxone 1 gram daily."]);
    const d2 = await ip.startNote(doc, admission.id, "progress", day(1));
    await run(d2, ["Creatinine is 1.5 today and sodium 137.", "Continue ceftriaxone 1 gram daily for the pneumonia."]);
    const review = await pb.prebillFor(coder, admission.id);
    expect(review.queries.map((q) => q.key)).toEqual(["aki"]);
    await expect(pb.answerQuery(coder, admission.id, "aki", "Acute kidney injury")).rejects.toThrow("Only the attending");
    await expect(pb.answerQuery(doc, admission.id, "aki", "Kidney stuff")).rejects.toThrow("listed options");
    const after = await pb.answerQuery(doc, admission.id, "aki", "Acute kidney injury");
    expect(after.queries[0].answer).toMatchObject({ option: "Acute kidney injury", addendum: true });
    expect(after.open).toBe(0);
    const adds = await repo.addenda.list(d2);
    expect(adds.at(-1)!.text).toContain("Clarification: Acute kidney injury. Clinical indicators reviewed: Creatinine 1 (day 1), 1.5 (day 2)");
  });
});
