import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-bulk-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("bulk FHIR export", () => {
  it("streams patients and each signed visit's resources as NDJSON for admins only", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const { bulkExport } = await import("@/lib/server/bulk");
    const owner = await newMember("Dr. Exporter");
    const doc = await newMember("Dr. Not Admin", { orgId: owner.orgId });
    const p = await repo.patients.create(owner, { mrn: "70001", name: "Ada Lovelace", dob: "1985-12-10", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    await repo.patients.create(owner, { mrn: "70002", name: "Alan Turing", dob: "1982-06-23", sex: "M", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(owner, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "BP", templateId: "soap" });
    await pipeline.recordConsent(owner, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Your blood pressure is 150 over 94, so let's start lisinopril 10 milligrams daily for hypertension.", tStart: 0, tEnd: 4 }]);
    await repo.encounters.update(owner, enc.id, { status: "processing", durationS: 600 });
    await pipeline.processEncounter(owner, enc.id, { engine: "local" });
    await pipeline.signEncounter(owner, enc.id, { force: true });
    await expect(bulkExport(doc)).rejects.toThrow("Only admins");
    const text = await new Response(await bulkExport(owner)).text();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l) as { resourceType: string; id?: string; name?: { family: string }[] });
    expect(lines.filter((r) => r.resourceType === "Patient").map((r) => r.name![0].family).sort()).toEqual(["Lovelace", "Turing"]);
    expect(lines.some((r) => r.resourceType === "Composition")).toBe(true);
    expect(lines.filter((r) => r.resourceType === "Patient")).toHaveLength(2);
  });
});
