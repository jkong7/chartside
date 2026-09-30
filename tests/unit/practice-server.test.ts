import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-practice-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const P = () => import("@/lib/server/practice");
const device = () => `dev${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.padEnd(20, "x");

describe("practice sessions", () => {
  it("runs an encounter end to end and grades the note against what was asked", async () => {
    const p = await P();
    const me = { device: device(), userId: null };
    const s = await p.startPractice({ caseId: "chest-pain", actor: me, name: "  jordan  smith", cohort: "nu m3", minutes: 12 });
    expect(s).toMatchObject({ status: "active", name: "Jordan", cohort: "NU-M3", timeLimitS: 720, engine: "local" });
    const a = await p.askPatient(s.id, me, { text: "Hi, I'm Jordan, a medical student. What brings you in today?" });
    expect(a.added.map((t) => t.role)).toEqual(["student", "patient"]);
    expect(a.added[1].text).toContain("pressure in my chest");
    await p.askPatient(s.id, me, { text: "Does it go anywhere, like your arm or jaw?" });
    const ex = await p.askPatient(s.id, me, { exam: "heart" });
    expect(ex.added.map((t) => t.role)).toEqual(["student", "exam"]);
    await expect(p.askPatient(s.id, { device: device(), userId: null }, { text: "Hi" })).rejects.toThrow(/belongs to someone else/);
    await expect(p.askPatient(s.id, me, { exam: "spleen" })).rejects.toThrow(/Unknown exam/);
    const ended = await p.askPatient(s.id, me, { text: "Okay, end encounter." });
    expect(ended.ended).toBe(true);
    expect(ended.session.status).toBe("noting");
    await expect(p.askPatient(s.id, me, { text: "One more thing" })).rejects.toThrow(/has ended/);
    const graded = await p.submitNote(s.id, me, "Chest pressure radiating to the left arm and jaw. Heart regular rhythm, no murmur. Lungs clear. A: ACS. P: ECG, troponin, aspirin.");
    expect(graded.status).toBe("graded");
    expect(graded.grade!.note!.invented).toEqual(["Lungs clear"]);
    expect(graded.reference!.engine).toBe("local");
    expect(graded.reference!.text).toContain("SUBJECTIVE");
    expect(graded.score).toBe(graded.grade!.overall);
    const card = p.publicCard(graded);
    expect(card).toMatchObject({ caseTitle: "Chest pain", name: "Jordan", overall: graded.score });
    expect(JSON.stringify(card)).not.toContain(me.device);
  });

  it("ends the encounter automatically once time is up", async () => {
    const p = await P();
    const me = { device: device(), userId: null };
    const s = await p.startPractice({ caseId: "headache", actor: me, minutes: 3 });
    const { run } = await import("@/lib/db");
    await run("UPDATE practice_sessions SET started_at = ? WHERE id = ?", new Date(Date.now() - 4 * 60_000).toISOString(), s.id);
    const r = await p.askPatient(s.id, me, { text: "When did it start?" });
    expect(r.ended).toBe(true);
    expect(r.session.status).toBe("noting");
    expect(Date.parse(r.session.endedAt!) - Date.parse((await p.getPractice(s.id))!.startedAt)).toBe(210_000);
  });

  it("grades a presentation and pimp answers", async () => {
    const p = await P();
    const me = { device: device(), userId: null };
    const s = await p.startPractice({ caseId: "chest-pain", actor: me });
    await expect(p.presentToAttending(s.id, me, { text: "He is 58 with chest pain and he needs an ECG." })).rejects.toThrow(/Finish the encounter/);
    await p.endPractice(s.id, me);
    const { practiceCase } = await import("@/lib/engine/practice/cases");
    const r = await p.presentToAttending(s.id, me, { text: practiceCase("chest-pain")!.model, seconds: 95 });
    expect(r.session.presentation!.grade.score).toBe(10);
    expect(r.questions).toHaveLength(3);
    const done = await p.answerPimp(s.id, me, ["ECG in 10 minutes", "Aspirin chewed", "I don't know"]);
    expect(done.presentation!.pimp!.map((x) => x.ok)).toEqual([true, true, false]);
  });

  it("claims device sessions for a signed-in student and badges .edu emails", async () => {
    const p = await P();
    const me = { device: device(), userId: null };
    const s = await p.startPractice({ caseId: "low-back-pain", actor: me });
    const u = await newMember("Riley Park", { email: `riley${Date.now()}@med.northwestern.edu` });
    expect(await p.claimPractice(me, u.id)).toBe(1);
    const after = (await p.getPractice(s.id))!;
    expect(after).toMatchObject({ userId: u.id, student: true, name: "Riley" });
    expect(p.owns(after, { device: null, userId: u.id })).toBe(true);
    expect(p.isStudentEmail("a@gmail.com")).toBe(false);
    expect(p.isStudentEmail("a@stanford.edu")).toBe(true);
    const later = await p.startPractice({ caseId: "headache", actor: { device: device(), userId: u.id } });
    expect(later.student).toBe(true);
  });

  it("builds a first-name leaderboard per class code with each person's best", async () => {
    const p = await P();
    const code = `CLS${Date.now().toString(36).toUpperCase()}`;
    const a = { device: device(), userId: null };
    const b = { device: device(), userId: null };
    const run = async (who: typeof a, name: string, qs: string[]) => {
      const s = await p.startPractice({ caseId: "chest-pain", actor: who, name, cohort: code });
      for (const q of qs) await p.askPatient(s.id, who, { text: q });
      return p.submitNote(s.id, who, "");
    };
    const low = await run(a, "Ava", ["What brings you in?"]);
    const high = await run(a, "Ava", ["What brings you in?", "Does it go anywhere?", "Do you smoke?", "Any family history of heart disease?"]);
    await run(b, "Ben", ["What brings you in?", "When did it start?"]);
    expect(high.score!).toBeGreaterThan(low.score!);
    const board = await p.leaderboard(code.toLowerCase());
    expect(board.attempts).toBe(3);
    expect(board.rows.map((r) => r.name)).toEqual(["Ava", "Ben"]);
    expect(board.rows[0].score).toBe(high.score);
    await expect(p.leaderboard("x")).rejects.toThrow(/Class codes/);
  });

  it("opens a phone session once, on the first device, before the link expires", async () => {
    const p = await P();
    const { get, run } = await import("@/lib/db");
    const s = await p.startPractice({ caseId: "chest-pain", actor: { device: null, userId: null }, channel: "phone", claimToken: "secret-token-123" });
    const d = device();
    expect((await p.openWithClaim(s.id, "wrong", d)).status).toBe("invalid");
    const first = await p.openWithClaim(s.id, "secret-token-123", d);
    expect(first.status).toBe("opened");
    expect(first.session?.id).toBe(s.id);
    expect((await p.getPractice(s.id))!.device).toBe(d);
    expect((await get<{ claim_hash: string | null }>("SELECT claim_hash FROM practice_sessions WHERE id = ?", s.id))!.claim_hash).toBeNull();
    expect((await p.openWithClaim(s.id, "secret-token-123", d)).status).toBe("opened");
    const other = device();
    expect((await p.openWithClaim(s.id, "secret-token-123", other)).status).toBe("used");
    expect((await p.getPractice(s.id))!.device).toBe(d);
    const old = await p.startPractice({ caseId: "chest-pain", actor: { device: null, userId: null }, channel: "phone", claimToken: "old-token-456" });
    const expires = (await get<{ claim_expires_at: string }>("SELECT claim_expires_at FROM practice_sessions WHERE id = ?", old.id))!.claim_expires_at;
    expect(Date.parse(expires) - Date.now()).toBeGreaterThan(23 * 3600_000);
    expect(Date.parse(expires) - Date.now()).toBeLessThanOrEqual(24 * 3600_000);
    await run("UPDATE practice_sessions SET claim_expires_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), old.id);
    expect((await p.openWithClaim(old.id, "old-token-456", other)).status).toBe("expired");
    expect((await p.getPractice(old.id))!.device).toBeNull();
    const race = await p.startPractice({ caseId: "headache", actor: { device: null, userId: null }, channel: "phone", claimToken: "race-token-789" });
    const both = await Promise.all([p.openWithClaim(race.id, "race-token-789", device()), p.openWithClaim(race.id, "race-token-789", device())]);
    expect(both.map((r) => r.status).sort()).toEqual(["opened", "used"]);
    expect(await p.getPractice("../etc")).toBeNull();
  });

  it("stops the browser cookie from reading a session once it's saved to an account", async () => {
    const p = await P();
    const shared = device();
    const alice = await newMember("Alice Shared");
    const bob = await newMember("Bob Shared");
    const s = await p.startPractice({ caseId: "chest-pain", actor: { device: shared, userId: null } });
    expect(p.owns(s, { device: shared, userId: null })).toBe(true);
    expect(await p.claimPractice({ device: shared, userId: alice.id }, alice.id)).toBe(1);
    const claimed = (await p.getPractice(s.id))!;
    expect(p.owns(claimed, { device: shared, userId: null })).toBe(false);
    expect(p.owns(claimed, { device: shared, userId: bob.id })).toBe(false);
    expect(p.owns(claimed, { device: null, userId: alice.id })).toBe(true);
    await expect(p.askPatient(s.id, { device: shared, userId: null }, { text: "Hi" })).rejects.toThrow(/belongs to someone else/);
    expect((await p.historyFor({ device: shared, userId: null })).map((x) => x.id)).not.toContain(s.id);
    expect((await p.historyFor({ device: shared, userId: bob.id })).map((x) => x.id)).not.toContain(s.id);
    expect((await p.historyFor({ device: null, userId: alice.id })).map((x) => x.id)).toContain(s.id);
    expect(await p.claimPractice({ device: shared, userId: bob.id }, bob.id)).toBe(0);
    expect((await p.getPractice(s.id))!.userId).toBe(alice.id);
  });

  it("grades a note once and refuses a resubmit after the reference note is shown", async () => {
    const p = await P();
    const me = { device: device(), userId: null };
    const s = await p.startPractice({ caseId: "chest-pain", actor: me });
    await p.askPatient(s.id, me, { text: "What brings you in today?" });
    const graded = await p.submitNote(s.id, me, "Chest pressure. A: ACS.");
    await expect(p.submitNote(s.id, me, graded.reference!.text)).rejects.toThrow(/already graded/);
    const after = (await p.getPractice(s.id))!;
    expect(after.note).toBe("Chest pressure. A: ACS.");
    expect(after.score).toBe(graded.score);
  });

  it("keeps daily caps in the database and per-session counters atomic", async () => {
    const p = await P();
    const { spendDaily, resetLimits } = await import("@/lib/server/ratelimit");
    const kind = `unit-${Date.now()}`;
    expect(await spendDaily(kind, 2)).toBe(true);
    expect(await spendDaily(kind, 2)).toBe(true);
    resetLimits();
    expect(await spendDaily(kind, 2)).toBe(false);
    expect(await spendDaily(`${kind}-other`, 2)).toBe(true);
    expect(await spendDaily(`${kind}-zero`, 0)).toBe(false);
    const s = await p.startPractice({ caseId: "headache", actor: { device: device(), userId: null } });
    const spent = await Promise.all(Array.from({ length: 5 }, () => p.spendSession(s.id, "voice_clips", 3)));
    expect(spent.filter(Boolean)).toHaveLength(3);
  });

  it("cleans names and class codes", async () => {
    const p = await P();
    expect(p.cleanName("<script>alert(1)</script>")).toBe("Scriptalertscript");
    expect(p.cleanName("maría josé")).toBe("María");
    expect(p.cleanCohort("")).toBeNull();
    expect(() => p.cleanCohort("a!")).toThrow();
  });
});
