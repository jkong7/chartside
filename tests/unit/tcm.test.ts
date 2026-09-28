import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addBusinessDays, tcmCode } from "@/lib/engine/tcm";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-tcm-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("transitional care management", () => {
  it("counts business days and applies the 7 and 14 day rules", () => {
    expect(addBusinessDays(new Date("2026-09-25T15:00:00"), 2).toDateString()).toBe(new Date("2026-09-29T12:00:00").toDateString());
    const base = { dischargeAt: "2026-09-21T15:00:00", contactAt: "2026-09-22T10:00:00", attempts: 1, firstAttemptAt: "2026-09-22T10:00:00", medRec: true };
    expect(tcmCode({ ...base, visitAt: "2026-09-26T09:00:00", mdm: "high" }).code).toBe("99496");
    expect(tcmCode({ ...base, visitAt: "2026-10-01T09:00:00", mdm: "high" }).code).toBe("99495");
    expect(tcmCode({ ...base, visitAt: "2026-09-26T09:00:00", mdm: "moderate" }).code).toBe("99495");
    expect(tcmCode({ ...base, visitAt: "2026-10-08T09:00:00", mdm: "high" }).unmet[0]).toContain("within 14 days");
    expect(tcmCode({ ...base, visitAt: "2026-09-26T09:00:00", mdm: "low" }).code).toBeNull();
    expect(tcmCode({ ...base, contactAt: "2026-09-25T10:00:00", firstAttemptAt: "2026-09-25T10:00:00", visitAt: "2026-09-26T09:00:00", mdm: "high" }).unmet[0]).toContain("after 2 business days");
    expect(tcmCode({ ...base, contactAt: null, attempts: 2, firstAttemptAt: "2026-09-22T09:00:00", visitAt: "2026-09-26T09:00:00", mdm: "high" }).code).toBe("99496");
    expect(tcmCode({ ...base, medRec: false, visitAt: "2026-09-26T09:00:00", mdm: "high" }).unmet).toContain("Medication reconciliation not documented");
  });

  it("opens an episode at discharge, logs contact, and codes the follow-up visit as TCM", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const tcm = await import("@/lib/server/tcm");
    const { tasks } = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Transitions");
    const p = await repo.patients.create(doc, { mrn: "99001", name: "Frank Dean", dob: "1950-03-03", sex: "M", pronouns: "", language: "en", chart: { problems: [{ name: "Heart failure", icd10: "I50.9" }], medications: [], allergies: [], coverage: { payer: "Medicare" } } });
    const dischargeAt = new Date(Date.now() - 4 * 86400000).toISOString();
    const id = await tcm.startTcm(doc, { patientId: p.id, clinicianId: doc.id, dischargeAt });
    const open = await tasks.forPatient(doc, p.id);
    expect(open.map((t) => t.key)).toEqual(expect.arrayContaining([`tcm:contact:${id}`, `tcm:visit:${id}`]));
    await tcm.recordContact(doc, id, "reached", new Date(new Date(dischargeAt).getTime() + 86400000).toISOString());
    await expect(tcm.recordContact(doc, id, "reached")).rejects.toThrow("already recorded");
    expect((await tasks.forPatient(doc, p.id)).some((t) => t.key === `tcm:contact:${id}`)).toBe(false);
    const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "Hospital follow-up", templateId: "soap" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [
      { speaker: "clinician", text: "We went over your discharge medications and reconciled them against your home list.", tStart: 0, tEnd: 4 },
      { speaker: "patient", text: "My ankles are still swollen and I get winded on one flight of stairs.", tStart: 5, tEnd: 9 },
      { speaker: "clinician", text: "Your heart failure is not controlled yet, so let's increase furosemide to 40 milligrams twice daily and check a BMP in 3 days.", tStart: 10, tEnd: 14 },
      { speaker: "clinician", text: "If you gain 3 pounds in a day or can't breathe lying flat, go to the emergency room; I'm worried you may need admission again.", tStart: 15, tEnd: 19 },
    ]);
    await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 1500 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const coding = (await repo.artifacts.get<import("@/lib/types").CodingResult>(enc.id, "coding"))!;
    expect(coding.tcm?.unmet).toEqual([]);
    expect(["99495", "99496"]).toContain(coding.em.code);
    await pipeline.signEncounter(doc, enc.id, { force: true });
    const [ep] = await tcm.tcmForPatient(doc, p.id);
    expect(ep).toMatchObject({ status: "billed", code: coding.em.code, visitEncounterId: enc.id });
    expect((await repo.claims.get(enc.id))!.content.lines.some((l) => l.cpt === "G2211")).toBe(false);
  });
});
