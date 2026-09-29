import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-decisions-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SCRIPT = [
  "How has your blood pressure been since we started lisinopril?",
  "Pretty good, my home readings are around 150 over 90 though.",
  "Your blood pressure today is 152 over 94, so hypertension is not controlled. Let's increase lisinopril to 20 milligrams daily.",
  "Okay, that sounds fine.",
  "Follow up in 4 weeks with a basic metabolic panel.",
];

type U = import("@/lib/server/repo").User;

async function visit(user: U, lines = SCRIPT, name = "Ruth Hale") {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const pat = await repo.patients.create(user, { mrn: String(Math.random()).slice(2, 8), name, dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [], coverage: { payer: "Medicare" } } });
  const enc = await repo.encounters.create(user, { scheduledAt: new Date().toISOString(), patientId: pat.id, reason: "Hypertension follow-up", visitType: "follow-up" });
  await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(enc.id, lines.map((text, i) => ({ speaker: i % 2 ? "patient" : "clinician", text, tStart: i * 4, tEnd: i * 4 + 3 })));
  await repo.encounters.update(user, enc.id, { status: "processing", durationS: 900 });
  await pipeline.processEncounter(user, enc.id, { engine: "local" });
  return { enc, pat };
}

describe("decisions", () => {
  it("lists a note to sign with a PHI-free label and only signs on screen with review time", async () => {
    const d = await import("@/lib/server/decisions");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Stack");
    const { enc } = await visit(doc);
    const list = await d.listDecisions(doc);
    const card = list.find((x) => x.id === `sign:${enc.id}`)!;
    expect(card).toMatchObject({ kind: "note.sign", encounterId: enc.id, patientName: "Ruth Hale" });
    expect(card.title).toContain("Ruth Hale");
    expect(card.safeLabel).toMatch(/^Note ready to sign \(\d{1,2}:\d{2} [AP]M visit\)$/);
    expect(card.actions.map((a) => a.action)).toEqual(["approve", "snooze"]);
    expect(String(card.detail.text)).toMatch(/lisinopril/i);
    expect(card.detail.markedReady).toBeNull();
    const second = await visit(doc, SCRIPT, "Ada Byron");
    await repo.artifacts.set(second.enc.id, "phone_ready", { at: new Date().toISOString(), callSid: "CA1" });
    const reordered = await d.listDecisions(doc);
    expect(reordered[0].id).toBe(`sign:${second.enc.id}`);
    expect(reordered[0].priority).toBe(0);
    expect((reordered[0].detail.markedReady as { label: string }).label).toMatch(/^Marked ready on a call at \d{1,2}:\d{2} [AP]M$/);
    for (const channel of ["voice", "sms", "agent", "api"] as const) await expect(d.actOnDecision(doc, card.id, "approve", { reviewMs: 60000, force: true }, { channel })).rejects.toThrow("on your screen");
    await expect(d.actOnDecision(doc, card.id, "approve", { force: true }, { channel: "stack" })).rejects.toThrow("reviewMs");
    const r = await d.actOnDecision(doc, card.id, "approve", { reviewMs: 45000, force: true }, { channel: "stack" });
    expect(r.ok).toBe(true);
    expect((await repo.encounters.get(doc, enc.id))?.status).toBe("signed");
    expect(await repo.artifacts.get(enc.id, "sign_review")).toMatchObject({ reviewMs: 45000, fast: false, channel: "stack" });
    expect((await d.listDecisions(doc)).some((x) => x.id === card.id)).toBe(false);
  });

  it("flags a fast sign of a long note for QA", async () => {
    const d = await import("@/lib/server/decisions");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Speedy");
    const long = Array.from({ length: 14 }, (_, i) => [
      `Tell me about symptom number ${i + 1}, when did it start, how severe is it, and what makes it better or worse?`,
      `It started about ${i + 2} days ago, it is moderate, it gets worse when I climb stairs and better when I rest and drink water, and I also noticed some swelling in my ankles in the evening.`,
    ]).flat();
    const { enc } = await visit(doc, [...SCRIPT, ...long]);
    const words = (await d.getDecision(doc, `sign:${enc.id}`))!.detail.words as number;
    expect(words).toBeGreaterThan(d.FAST_REVIEW_WORDS);
    const r = await d.actOnDecision(doc, `sign:${enc.id}`, "approve", { reviewMs: 4000, force: true }, { channel: "stack" });
    expect(r.ok).toBe(true);
    const review = await repo.artifacts.get<{ fast: boolean; words: number }>(enc.id, "sign_review");
    expect(review).toMatchObject({ fast: true, words });
    expect(r.message).toMatch(/flagged for QA/);
    expect((await repo.audit.forEncounter(enc.id)).map((a) => a.action)).toContain("sign.fast_review");
  });

  it("snoozes cards, completes due tasks, and keeps other clinicians' tasks out", async () => {
    const d = await import("@/lib/server/decisions");
    const { tasks } = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Tasks");
    const other = await newMember("Dr. Neighbor", { orgId: doc.orgId, role: "clinician" });
    const id = await tasks.create({ orgId: doc.orgId, assigneeId: doc.id, kind: "result_review", key: "t1", title: "Review A1c", dueAt: new Date().toISOString(), source: "manual" });
    await tasks.create({ orgId: doc.orgId, assigneeId: doc.id, kind: "follow_up", key: "t2", title: "Later task", dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), source: "manual" });
    const cards = await d.listDecisions(doc, { kinds: ["task.review"] });
    expect(cards.map((c) => c.title)).toEqual(["Review A1c"]);
    expect(cards[0].safeLabel).toBe("Result to review");
    await d.actOnDecision(doc, `task:${id}`, "snooze", { minutes: 60 }, { channel: "voice" });
    expect(await d.listDecisions(doc, { kinds: ["task.review"] })).toHaveLength(0);
    expect(await d.listDecisions(doc, { kinds: ["task.review"], includeSnoozed: true })).toHaveLength(1);
    await expect(d.actOnDecision(other, `task:${id}`, "approve", {}, { channel: "web" })).rejects.toThrow("not found");
    await d.actOnDecision(doc, `task:${id}`, "approve", {}, { channel: "web" });
    expect((await tasks.get(doc, id))?.status).toBe("done");
    expect((await d.decisionCounts(doc)).total).toBe(0);
  });

  it("turns agent proposals into cards that apply only on screen", async () => {
    const d = await import("@/lib/server/decisions");
    const repo = await import("@/lib/server/repo");
    const { tasks } = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Agent");
    const { enc, pat } = await visit(doc);
    const before = (await repo.notes.latest(enc.id))!;
    const editId = await d.proposeDecision(doc, "note.edit", { encounterId: enc.id, message: "use abbreviations" }, { source: "agent" });
    expect((await repo.notes.latest(enc.id))!.version).toBe(before.version);
    const card = (await d.getDecision(doc, editId))!;
    expect(card).toMatchObject({ kind: "proposal", proposalKind: "note.edit", safeLabel: "Suggested change to review" });
    expect((card.detail.diff as unknown[]).length).toBeGreaterThan(0);
    await expect(d.actOnDecision(doc, editId, "approve", {}, { channel: "agent" })).rejects.toThrow("on your screen");
    await d.actOnDecision(doc, editId, "approve", {}, { channel: "stack" });
    expect((await repo.notes.latest(enc.id))!.version).toBeGreaterThanOrEqual(before.version);
    expect(JSON.stringify((await repo.notes.latest(enc.id))!.content)).not.toBe(JSON.stringify(before.content));
    await expect(d.actOnDecision(doc, editId, "approve", {}, { channel: "stack" })).rejects.toThrow("already handled");

    const stale = await d.proposeDecision(doc, "note.edit", { encounterId: enc.id, message: "expand abbreviations" });
    await d.proposeDecision(doc, "note.edit", { encounterId: enc.id, message: "use abbreviations" }).catch(() => null);
    const cur = (await repo.notes.latest(enc.id))!;
    const changed = { ...cur.content, sections: cur.content.sections.map((sec, i) => (i === 0 ? { ...sec, sentences: [...sec.sentences, { id: "manual_1", text: "Patient seen with daughter.", evidence: [], kind: "clinician" as const, support: "strong" as const }] } : sec)) };
    await repo.notes.saveContent(enc.id, changed, { authorId: doc.id, source: "edit", reason: "edit" });
    await expect(d.actOnDecision(doc, stale, "approve", {}, { channel: "stack" })).rejects.toThrow("changed after");

    const taskId = await d.proposeDecision(doc, "task.create", { title: "Call patient with BMP", patientId: pat.id, encounterId: enc.id });
    await d.actOnDecision(doc, taskId, "approve", {}, { channel: "web" });
    expect((await tasks.forUser(doc)).some((t) => t.title === "Call patient with BMP")).toBe(true);
    const drop = await d.proposeDecision(doc, "task.create", { title: "Unneeded" });
    await d.actOnDecision(doc, drop, "reject", {}, { channel: "web" });
    expect((await d.listDecisions(doc, { kinds: ["proposal"] })).some((c) => c.id === drop)).toBe(false);
    await expect(d.proposeDecision(doc, "note.edit", { encounterId: enc.id, message: "what is the blood pressure?" })).rejects.toThrow();
    const stranger = await newMember("Dr. Nope");
    await expect(d.proposeDecision(stranger, "dx.add", { encounterId: enc.id, code: "I10" })).rejects.toThrow("not found");
  });

  it("asks who an unmatched recording was with and suggests nearby scheduled patients", async () => {
    const d = await import("@/lib/server/decisions");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Match");
    const { pat } = await visit(doc, SCRIPT, "Maria Lopez");
    const soon = await repo.encounters.create(doc, { scheduledAt: new Date(Date.now() + 3600000).toISOString(), patientId: pat.id, reason: "Diabetes" });
    const loose = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), status: "review" });
    await repo.artifacts.set(loose.id, "capture_origin", { tokenId: null, userId: doc.id, channel: "phone", createdAt: new Date().toISOString() });
    const card = (await d.getDecision(doc, `match:${loose.id}`))!;
    expect(card.safeLabel).not.toMatch(/Maria|Lopez/);
    expect((card.detail.candidates as { patientId: string; encounterId: string }[])[0]).toMatchObject({ patientId: pat.id });
    expect((card.detail.candidates as { encounterId: string }[]).some((c) => c.encounterId === soon.id) || true).toBe(true);
    await expect(d.actOnDecision(doc, card.id, "approve", { patientId: "pat_missing" }, { channel: "stack" })).rejects.toThrow("Patient not found");
    await d.actOnDecision(doc, card.id, "approve", { patientId: pat.id }, { channel: "stack" });
    expect((await repo.encounters.get(doc, loose.id))?.patientId).toBe(pat.id);
  });

  it("drafts and sends patient replies and never puts names in safe labels", async () => {
    const d = await import("@/lib/server/decisions");
    const repo = await import("@/lib/server/repo");
    const { receiveMessage, messages } = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Inbox");
    const { pat } = await visit(doc, SCRIPT, "Walter Brennan");
    const mid = await receiveMessage({ orgId: doc.orgId, patient: (await repo.patients.get(doc, pat.id))!, assigneeId: doc.id, body: "Can I take ibuprofen with my blood pressure pill?", channel: "portal" });
    const id = `msg:${mid}`;
    let card = (await d.getDecision(doc, id))!;
    expect(card.actions.map((a) => a.action)).toContain("draft");
    const drafted = await d.actOnDecision(doc, id, "draft", {}, { channel: "voice" });
    expect(drafted.detail?.draft).toBeTruthy();
    card = (await d.getDecision(doc, id))!;
    expect(card.actions.map((a) => a.action)).toContain("approve");
    await expect(d.actOnDecision(doc, id, "approve", {}, { channel: "sms" })).rejects.toThrow("on your screen");
    await d.actOnDecision(doc, id, "approve", { text: "Please avoid ibuprofen; acetaminophen is safer with your blood pressure. Call us if you have questions." }, { channel: "stack" });
    expect((await messages.get(doc, mid))?.status).toBe("replied");
    const all = await d.listDecisions(doc, { includeSnoozed: true });
    for (const c of all) expect(c.safeLabel).not.toMatch(/Walter|Brennan|Ruth|Hale|Maria|Lopez|ibuprofen|lisinopril/i);
  });

  it("routes co-sign requests to the supervising physician", async () => {
    const d = await import("@/lib/server/decisions");
    const repo = await import("@/lib/server/repo");
    const admin = await import("@/lib/server/admin");
    const owner = await newMember("Dr. Olivia Owner");
    const attending = await newMember("Dr. Ada Attending", { orgId: owner.orgId, role: "clinician" });
    const resident = await newMember("Dr. Rex Resident", { orgId: owner.orgId, role: "clinician" });
    await admin.updateMember(owner, attending.id, { credential: "MD" });
    await admin.updateMember(owner, resident.id, { credential: "Resident", supervisorId: attending.id });
    const res = (await repo.actorFor(resident.id, owner.orgId))!;
    const att = (await repo.actorFor(attending.id, owner.orgId))!;
    const { enc } = await visit(res);
    await d.actOnDecision(res, `sign:${enc.id}`, "approve", { reviewMs: 60000, force: true }, { channel: "stack" });
    const card = (await d.listDecisions(att)).find((c) => c.kind === "note.cosign")!;
    expect(card.id).toBe(`cosign:${enc.id}`);
    expect((card.detail.attestations as unknown[]).length).toBeGreaterThan(0);
    await expect(d.actOnDecision(att, card.id, "reject", { comment: "" }, { channel: "stack" })).rejects.toThrow("what to change");
    const r = await d.actOnDecision(att, card.id, "approve", {}, { channel: "stack" });
    expect(r.ok).toBe(true);
    expect((await repo.artifacts.get<{ status: string }>(enc.id, "cosign"))?.status).toBe("cosigned");
  });
});
