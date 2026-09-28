import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-signoff-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function teachingClinic() {
  const repo = await import("@/lib/server/repo");
  const admin = await import("@/lib/server/admin");
  const owner = await newMember("Dr. Olivia Owner");
  const orgId = owner.orgId;
  const attending = await newMember("Dr. Ada Attending", { orgId, role: "clinician" });
  const resident = await newMember("Dr. Rex Resident", { orgId, role: "clinician" });
  const other = await newMember("Dr. Otto Other", { orgId, role: "clinician" });
  await admin.updateMember(owner, attending.id, { credential: "MD" });
  await admin.updateMember(owner, other.id, { credential: "MD" });
  await expect(admin.updateMember(owner, resident.id, { credential: "Resident", supervisorId: resident.id })).rejects.toThrow("can't supervise themselves");
  await admin.updateMember(owner, resident.id, { credential: "Resident" });
  return { repo, owner, orgId, attending: (await repo.actorFor(attending.id, orgId))!, resident: (await repo.actorFor(resident.id, orgId))!, other: (await repo.actorFor(other.id, orgId))!, admin };
}

async function visit(user: import("@/lib/server/repo").User, lines: string[]) {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const pat = await repo.patients.create(user, { mrn: String(Date.now()).slice(-6), name: "Ruth Hale", dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [], coverage: { payer: "Medicare" } } });
  const enc = await repo.encounters.create(user, { scheduledAt: "2026-09-27T14:00:00.000Z", patientId: pat.id, reason: "Hypertension follow-up", visitType: "follow-up" });
  await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(enc.id, lines.map((text, i) => ({ speaker: i % 2 ? "patient" : "clinician", text, tStart: i * 4, tEnd: i * 4 + 3 })));
  await repo.encounters.update(user, enc.id, { status: "processing", durationS: 900 });
  await pipeline.processEncounter(user, enc.id, { engine: "local" });
  return enc;
}

const SCRIPT = [
  "How has your blood pressure been since we started lisinopril?",
  "Pretty good, my home readings are around 150 over 90 though.",
  "Your blood pressure today is 152 over 94, so hypertension is not controlled. Let's increase lisinopril to 20 milligrams daily.",
  "Okay, that sounds fine.",
  "Follow up in 4 weeks with a basic metabolic panel.",
];

describe("co-signature and addenda", () => {
  it("routes a resident's signed note to the attending, holds the claim, and applies GC after attestation", async () => {
    const { repo, owner, attending, resident, other, admin } = await teachingClinic();
    const pipeline = await import("@/lib/server/pipeline");
    const signoff = await import("@/lib/server/signoff");
    const revenue = await import("@/lib/server/revenue");
    const enc = await visit(resident, SCRIPT);

    const blocked = await pipeline.signEncounter(resident, enc.id, { force: true });
    expect(blocked.signed).toBe(false);
    expect(blocked.blockers[0]).toContain("no supervising physician is assigned");

    await expect(admin.updateMember(owner, resident.id, { supervisorId: owner.id })).rejects.toThrow("MD or DO");
    await admin.updateMember(owner, resident.id, { supervisorId: attending.id });
    const res2 = (await repo.actorFor(resident.id, resident.orgId))!;
    const out = await pipeline.signEncounter(res2, enc.id, { force: true });
    expect(out).toMatchObject({ signed: true, cosign: { supervisor: "Dr. Ada Attending" } });

    expect((await repo.encounters.get(attending, enc.id))?.id).toBe(enc.id);
    expect(await repo.encounters.get(other, enc.id)).toBeUndefined();
    expect((await signoff.pendingCosigns(attending)).map((p) => p.encounterId)).toEqual([enc.id]);
    expect((await repo.claims.get(enc.id))?.status).toBe("on_hold");
    await expect(revenue.claimAction(owner, enc.id, "approve", {})).rejects.toThrow("co-signature from Dr. Ada Attending");
    await expect(signoff.cosignNote(other, enc.id, { attestation: "tp_present" })).rejects.toThrow("not found");
    await expect(signoff.cosignNote(owner, enc.id, { attestation: "tp_present" })).rejects.toThrow("Only Dr. Ada Attending can co-sign");
    const em = (await repo.claims.get(enc.id))!.content.lines.find((l) => l.source === "em")!;
    if (!["99212", "99213"].includes(em.cpt)) await expect(signoff.cosignNote(attending, enc.id, { attestation: "tp_primary_care" })).rejects.toThrow("primary care exception does not cover");

    const done = await signoff.cosignNote(attending, enc.id, { attestation: "tp_present", comment: "Agree; recheck BP in clinic." });
    expect(done.status).toBe("cosigned");
    const claim = (await repo.claims.get(enc.id))!;
    expect(claim.content.lines.find((l) => l.source === "em")!.modifiers).toContain("GC");
    expect(claim.content.supervising).toEqual({ name: "Dr. Ada Attending", modifier: "GC" });
    expect(["ready", "needs_review"]).toContain(claim.status);
    const list = await repo.addenda.list(enc.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "attestation", author: "Dr. Ada Attending" });
    expect(list[0].text).toContain("I, Dr. Ada Attending, saw and evaluated the patient, discussed the case with Dr. Rex Resident");
    const rec = (await repo.notes.latest(enc.id))!;
    const text = await signoff.documentText(enc.id, rec.content);
    expect(text).toContain("Signed electronically by Dr. Rex Resident, Resident");
    expect(text).toContain("Co-signed electronically by Dr. Ada Attending");
    expect((await repo.audit.forEncounter(enc.id)).map((a) => a.action)).toEqual(expect.arrayContaining(["cosign.requested", "note.cosigned"]));
  });

  it("lets the attending return a note, and the resident re-signs after editing", async () => {
    const { repo, owner, attending, resident, admin } = await teachingClinic();
    const pipeline = await import("@/lib/server/pipeline");
    const signoff = await import("@/lib/server/signoff");
    await admin.updateMember(owner, resident.id, { supervisorId: attending.id });
    const res = (await repo.actorFor(resident.id, resident.orgId))!;
    const enc = await visit(res, SCRIPT);
    await pipeline.signEncounter(res, enc.id, { force: true });
    await expect(signoff.returnNote(attending, enc.id, "  ")).rejects.toThrow("Tell the author");
    const back = await signoff.returnNote(attending, enc.id, "Document the orthostatic vitals.");
    expect(back.status).toBe("returned");
    expect((await repo.encounters.get(res, enc.id))!.status).toBe("review");
    expect((await repo.notes.latest(enc.id))!.status).toBe("draft");
    const again = await pipeline.signEncounter(res, enc.id, { force: true });
    expect(again.signed).toBe(true);
    const c = (await repo.artifacts.get<import("@/lib/server/signoff").Cosign>(enc.id, "cosign"))!;
    expect(c.status).toBe("pending");
    expect(c.history.map((h) => h.action)).toEqual(["requested", "returned", "requested"]);
  });

  it("appends hash-chained addenda without altering the signed note and detects tampering", async () => {
    const { repo, attending, other } = await teachingClinic();
    const pipeline = await import("@/lib/server/pipeline");
    const signoff = await import("@/lib/server/signoff");
    const enc = await visit(attending, SCRIPT);
    await expect(signoff.addAddendum(attending, enc.id, { text: "Too early" })).rejects.toThrow("after the note is signed");
    await pipeline.signEncounter(attending, enc.id, { force: true });
    const before = JSON.stringify((await repo.notes.latest(enc.id))!.content);
    await expect(signoff.addAddendum(attending, enc.id, { kind: "correction", text: "Dose is 20 mg, not 10 mg." })).rejects.toThrow("needs a reason");
    await expect(signoff.addAddendum(other, enc.id, { text: "Not my patient" })).rejects.toThrow();
    await signoff.addAddendum(attending, enc.id, { kind: "addendum", text: "BMP resulted: potassium 4.4, creatinine 0.9." });
    await signoff.addAddendum(attending, enc.id, { kind: "correction", text: "Home readings were 150/90, not 140/90.", reason: "Transcription error" });
    await signoff.addAddendum(attending, enc.id, { kind: "late_entry", text: "Discussed DASH diet for 5 minutes.", reason: "Omitted at time of signing" });
    expect(JSON.stringify((await repo.notes.latest(enc.id))!.content)).toBe(before);
    const list = await repo.addenda.list(enc.id);
    expect(list.map((a) => a.kind)).toEqual(["addendum", "correction", "late_entry"]);
    expect(list[1].prevDigest).toBe(list[0].digest);
    expect(await signoff.verifyChain(enc.id)).toEqual({ intact: true, checked: 4, brokenAt: null });
    const { run } = await import("@/lib/db");
    await run("UPDATE addenda SET text = ? WHERE id = ?", "Home readings were 130/80.", list[1].id);
    expect(await signoff.verifyChain(enc.id)).toMatchObject({ intact: false, brokenAt: list[1].id });
    const bundle = await pipeline.exportFhir(attending, enc.id);
    const appended = bundle.entry.map((e) => e.resource as { relatesTo?: { code: string }[] }).filter((r) => r.relatesTo?.[0]?.code === "appends");
    expect(appended).toHaveLength(3);
  });
});
