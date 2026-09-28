import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { screen, screenInput, type Trial } from "@/lib/engine/trials";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-trials-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const t = (criteria: Trial["criteria"]): Trial => ({ id: "t1", title: "Sample study", sponsor: "", nct: null, contact: "", status: "active", criteria });

describe("research pre-screening", () => {
  it("separates likely, possible, excluded, and non-matching patients", () => {
    const x = screenInput({ problems: [{ name: "Type 2 diabetes mellitus", icd10: "E11.9" }], medications: [{ name: "metformin" }], allergies: [], labs: [{ name: "Hemoglobin A1c", value: "8.4 %", date: "2026-09-10" }] }, 58, "F", { dx: [], results: [], meds: [] });
    expect(screen(t({ minAge: 40, maxAge: 75, anyDx: ["E11"], labs: [{ name: "Hemoglobin A1c", op: ">=", value: 7.5 }] }), x)).toMatchObject({ status: "likely", met: ["Age 58 (40 to 75)", "Diagnosis E11.9", "Hemoglobin A1c 8.4 (needs >= 7.5)"] });
    expect(screen(t({ anyDx: ["E11"], labs: [{ name: "eGFR", op: ">=", value: 45 }] }), x)).toMatchObject({ status: "possible", unknown: ["eGFR >= 45 (no result on file)"] });
    expect(screen(t({ anyDx: ["E11"], excludeMeds: ["metformin"] }), x).status).toBe("excluded");
    expect(screen(t({ anyDx: ["I50"] }), x).status).toBe("no");
  });

  it("screens the visit, refers once, and opens a task for the study team", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const tr = await import("@/lib/server/trials");
    const doc = await newMember("Dr. Rosa Diaz");
    await expect(tr.saveTrial(doc, { title: "X", criteria: {} })).rejects.toThrow("inclusion");
    await expect(tr.saveTrial(doc, { title: "X", nct: "12345", criteria: { anyDx: ["E11"] } })).rejects.toThrow("NCT");
    const trial = await tr.saveTrial(doc, { title: "Sample: CGM coaching for uncontrolled type 2 diabetes", sponsor: "Internal", contact: "research@clinic.test", criteria: { minAge: 40, maxAge: 75, anyDx: ["e11", "junk!"], labs: [{ name: "Hemoglobin A1c", op: ">=", value: 7.5 }], excludeMeds: ["Insulin glargine"] } });
    expect(trial.criteria).toEqual({ minAge: 40, maxAge: 75, anyDx: ["E11"], excludeMeds: ["insulin glargine"], labs: [{ name: "Hemoglobin A1c", op: ">=", value: 7.5 }] });
    const d = DEMO_PATIENTS.find((x) => x.key === "gonzalez")!;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: d.visit.reason, templateId: "soap" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, d.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 5, tEnd: i * 5 + 4 })));
    await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 900 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const m = await tr.screenEncounter(doc, enc.id);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ status: "likely", referred: false });
    await tr.referToTrial(doc, enc.id, trial.id);
    await expect(tr.referToTrial(doc, enc.id, trial.id)).rejects.toThrow("Already referred");
    expect((await tr.screenEncounter(doc, enc.id))[0].referred).toBe(true);
    const { tasks } = await import("@/lib/server/inbox");
    expect((await tasks.forEncounter(enc.id)).find((x) => x.key === `trial:${trial.id}`)?.title).toContain("CGM coaching");
    const dash = await tr.researchDashboard(doc);
    expect(dash[0]).toMatchObject({ referrals: 1 });
    expect(dash[0].candidates.map((c) => [c.name, c.referred])).toEqual([["Maria Gonzalez", true]]);
    await tr.saveTrial(doc, { ...trial, status: "closed" });
    expect(await tr.screenEncounter(doc, enc.id)).toEqual([]);
  });
});
