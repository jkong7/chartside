import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-queue-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("sign queue", () => {
  it("lists unsigned notes with blockers from a dry run, and signs only clean ones", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const q = await import("@/lib/server/queue");
    const doc = await newMember("Dr. Queue");
    const p = await repo.patients.create(doc, { mrn: "44001", name: "Nina Cole", dob: "1980-02-02", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const draft = async (lines: [("clinician" | "patient"), string][]) => {
      const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "Visit", templateId: "soap" });
      await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
      await repo.utterances.append(enc.id, lines.map(([speaker, text], i) => ({ speaker, text, tStart: i * 5, tEnd: i * 5 + 4 })));
      await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 600 });
      await pipeline.processEncounter(doc, enc.id, { engine: "local" });
      return enc.id;
    };
    const a = await draft([["patient", "I've had a sore throat for three days."], ["clinician", "Let's do a rapid strep test."]]);
    const b = await draft([["patient", "My blood pressure readings at home have been fine."], ["clinician", "Your blood pressure is 124 over 78 today, so your hypertension is well controlled. Continue lisinopril 10 milligrams daily."]]);
    const queue = await q.unsignedQueue(doc);
    expect(queue.map((r) => r.id).sort()).toEqual([a, b].sort());
    const blockedA = queue.find((r) => r.id === a)!;
    expect(blockedA.blockers.join(" ")).toMatch(/unreviewed: Rapid strep antigen/);
    expect((await repo.encounters.get(doc, a))!.status).toBe("review");
    const results = await q.signClean(doc, queue.filter((r) => !r.blockers.length).map((r) => r.id));
    for (const r of results) expect(r.signed).toBe(true);
    expect((await q.unsignedQueue(doc)).map((r) => r.id)).toEqual([a]);
  });
});
