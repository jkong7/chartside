import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-checkin-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("post-visit check-ins", () => {
  it("builds visit-specific questions, sends when due, and routes answers to the inbox with triage", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const ck = await import("@/lib/server/checkin");
    const { inboxFor } = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Follow Through");
    const d = DEMO_PATIENTS.find((x) => x.key === "gonzalez")!;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    await repo.patients.setContact(doc, p.id, { phone: null, email: "maria@example.test", pref: "email" });
    const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: d.visit.reason, templateId: "soap" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, d.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 5, tEnd: i * 5 + 4 })));
    await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 900 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    await expect(ck.scheduleCheckin(doc, enc.id, 3)).rejects.toThrow("Sign the note");
    await pipeline.signEncounter(doc, enc.id, { force: true });
    const rec = await ck.scheduleCheckin(doc, enc.id, 3);
    expect(rec.questions[0].key).toBe("overall");
    expect(rec.questions.some((q) => q.key.startsWith("side:"))).toBe(true);
    expect(await ck.dispatchDue(doc.orgId, "https://app.test")).toBe(0);
    await repo.artifacts.set(enc.id, "checkin", { ...rec, sendAt: new Date(Date.now() - 1000).toISOString() });
    expect(await ck.dispatchDue(doc.orgId, "https://app.test")).toBe(1);
    const pub = (await ck.publicCheckin(rec.token))!;
    expect(pub).toMatchObject({ first: "Maria", submitted: false });
    await expect(ck.submitCheckin(rec.token, {})).rejects.toThrow("how you're feeling");
    const side = rec.questions.find((q) => q.key.startsWith("side:"))!;
    const r = await ck.submitCheckin(rec.token, { overall: "worse", [side.key]: "bothersome", note: "Dizzy when I stand up" });
    expect(r.flags.map((f) => f.level)).toEqual(["same_day", "same_day"]);
    await expect(ck.submitCheckin(rec.token, { overall: "better" })).rejects.toThrow("already have");
    const inbox = await inboxFor(doc);
    const msg = inbox.messages.find((m: { body: string }) => m.body.startsWith("Post-visit check-in"));
    expect(msg).toBeTruthy();
    expect(msg!.body).toContain("Dizzy when I stand up");
  });
});
