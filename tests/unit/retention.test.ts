import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-retention-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("transcript retention", () => {
  it("removes transcripts after the policy window and keeps the signed note", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const rt = await import("@/lib/server/retention");
    const { run } = await import("@/lib/db");
    const owner = await newMember("Dr. Retention");
    const doc = await newMember("Dr. Staff", { orgId: owner.orgId });
    await expect(rt.setRetention(doc, { transcriptDays: 30 })).rejects.toThrow("Only admins");
    await expect(rt.setRetention(owner, { transcriptDays: 5 })).rejects.toThrow("Choose");
    const p = await repo.patients.create(owner, { mrn: "60001", name: "Tess Ward", dob: "1975-05-05", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(owner, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "BP", templateId: "soap" });
    await pipeline.recordConsent(owner, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Your blood pressure is 150 over 94, so let's start lisinopril 10 milligrams daily for hypertension.", tStart: 0, tEnd: 4 }]);
    await repo.encounters.update(owner, enc.id, { status: "processing", durationS: 600 });
    await pipeline.processEncounter(owner, enc.id, { engine: "local" });
    await pipeline.signEncounter(owner, enc.id, { force: true });
    expect(await rt.setRetention(owner, { transcriptDays: 30 })).toBe(0);
    await run("UPDATE encounters SET signed_at = ? WHERE id = ?", new Date(Date.now() - 31 * 86400000).toISOString(), enc.id);
    expect(await rt.purgeTranscripts(owner.orgId)).toBe(1);
    expect(await rt.purgeTranscripts(owner.orgId)).toBe(0);
    const utts = await repo.utterances.list(enc.id);
    expect(utts.every((u) => u.text === rt.PURGED_TEXT && u.redacted)).toBe(true);
    expect(JSON.stringify((await repo.notes.latest(enc.id))!.content)).toContain("lisinopril");
    const { complianceReport } = await import("@/lib/server/compliance");
    expect((await complianceReport(owner)).checks.find((c) => c.key === "transcripts")).toMatchObject({ status: "pass", detail: "Transcripts are removed 30 days after signing; the signed note is kept" });
  });
});
