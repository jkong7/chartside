import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-loc-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("locations", () => {
  it("manages sites, defaults a clinician's location, filters visits, and puts the facility on claims", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const lc = await import("@/lib/server/locations");
    const owner = await newMember("Dr. Health System");
    const doc = await newMember("Dr. Site Doc", { orgId: owner.orgId });
    await expect(lc.saveLocation(doc, { name: "North" })).rejects.toThrow();
    const north = await lc.saveLocation(owner, { name: "North Clinic", address: "100 N Main St, Evanston, IL 60201" });
    const uc = await lc.saveLocation(owner, { name: "Urgent Care West", address: "9 W Lake St, Chicago, IL 60601", pos: "20" });
    await expect(lc.saveLocation(owner, { name: "north clinic" })).rejects.toThrow("already exists");
    expect(await lc.defaultLocationFor(doc)).toBe(north.id);
    await lc.setMyLocation(doc, uc.id);
    const me = (await repo.actorFor(doc.id, doc.orgId))!;
    expect(await lc.defaultLocationFor(me)).toBe(uc.id);
    const p = await repo.patients.create(me, { mrn: "20001", name: "Ivy Lane", dob: "1990-01-01", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(me, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "acute", reason: "Sore throat", templateId: "soap", locationId: uc.id });
    await repo.encounters.create(me, { patientId: p.id, scheduledAt: new Date().toISOString(), reason: "x", locationId: north.id });
    expect((await repo.encounters.list(me, { locationId: uc.id })).map((e) => e.id)).toEqual([enc.id]);
    await pipeline.recordConsent(me, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [{ speaker: "patient", text: "My throat has been sore for two days.", tStart: 0, tEnd: 3 }, { speaker: "clinician", text: "Your throat looks red. This is viral pharyngitis; drink fluids and use salt water gargles.", tStart: 4, tEnd: 8 }]);
    await repo.encounters.update(me, enc.id, { status: "processing", durationS: 600 });
    await pipeline.processEncounter(me, enc.id, { engine: "local" });
    const claim = (await repo.artifacts.get<import("@/lib/engine/billing").Claim>(enc.id, "claim"))!;
    expect(claim.serviceFacility).toEqual({ name: "Urgent Care West", address: "9 W Lake St, Chicago, IL 60601" });
    expect(claim.placeOfService).toBe("20");
    const { impact } = await import("@/lib/server/impact");
    expect((await impact(owner)).adoption.byLocation.map((l) => l.name).sort()).toEqual(["North Clinic", "Urgent Care West"]);
  });
});
