import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-impact-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("impact", () => {
  it("computes adoption, estimated time saved against a baseline, and the level-of-service mix", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const { impact } = await import("@/lib/server/impact");
    const { run } = await import("@/lib/db");
    const u = await newMember("Dr. Avery Chen");
    const p = await repo.patients.create(u, { mrn: "I1", name: "Ruth Hale", dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [], coverage: { payer: "Medicare" } } });
    for (let i = 0; i < 2; i++) {
      const enc = await repo.encounters.create(u, { scheduledAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(), patientId: p.id, reason: "BP" });
      await pipeline.recordConsent(u, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
      await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Your blood pressure is 152 over 94. Let's increase lisinopril to 20 milligrams daily.", tStart: 0, tEnd: 5, source: "final" }]);
      await pipeline.processEncounter(u, enc.id, { engine: "local" });
      await run("UPDATE audit SET created_at = ? WHERE encounter_id = ? AND action = 'note.generated'", new Date(Date.now() - 5 * 60000).toISOString(), enc.id);
      await pipeline.signEncounter(u, enc.id, { force: true });
    }
    await repo.encounters.create(u, { scheduledAt: new Date(Date.now() - 7200000 - 60000).toISOString(), patientId: p.id, reason: "No capture" });
    const r = await impact(u, { days: 30, baselineMinutes: 7 });
    expect(r.adoption).toMatchObject({ clinicians: 1, visits: 3, ambientRate: 67 });
    expect(r.time.signed).toBe(2);
    expect(r.time.medianReviewMinutes).toBeGreaterThanOrEqual(4.9);
    expect(r.time.hoursSaved).toBeGreaterThan(0);
    expect(r.revenue.claims).toBe(2);
    expect(r.revenue.emMix.reduce((n, m) => n + m.count, 0)).toBe(2);
  });
});
