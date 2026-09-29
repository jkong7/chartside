import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-growth-"));
const PORT = 3402;
let mock: ChildProcess;

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://chartside.test";
  process.env.NPPES_BASE_URL = `http://127.0.0.1:${PORT}`;
  mock = spawn(process.execPath, ["tests/e2e/mock-nppes.mjs"], { env: { ...process.env, MOCK_NPPES_PORT: String(PORT) }, stdio: "pipe" });
  await new Promise<void>((resolve) => mock.stdout!.on("data", (d) => String(d).includes("mock nppes") && resolve()));
});

afterAll(() => {
  mock.kill();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.NPPES_BASE_URL;
  delete process.env.CHARTSIDE_PUBLIC_URL;
});

type U = import("@/lib/server/repo").User;

async function signedVisit(user: U, name: string, opts: { endedAt?: string; signedAt?: string } = {}) {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const { run } = await import("@/lib/db");
  const pat = await repo.patients.create(user, { mrn: `MRN${Math.random().toString().slice(2, 8)}`, name, dob: "1961-07-14", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [], coverage: { payer: "Medicare" } } });
  const enc = await repo.encounters.create(user, { scheduledAt: new Date().toISOString(), patientId: pat.id, reason: "Secret reason about gout", visitType: "follow-up" });
  await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(enc.id, [
    { speaker: "clinician", text: "How is the knee pain?", tStart: 0, tEnd: 3 },
    { speaker: "patient", text: "Still sore when I walk.", tStart: 4, tEnd: 7 },
    { speaker: "clinician", text: "Let's continue ibuprofen and follow up in two weeks.", tStart: 8, tEnd: 12 },
  ]);
  await repo.encounters.update(user, enc.id, { status: "processing", endedAt: opts.endedAt ?? new Date(Date.now() - 600000).toISOString() });
  await pipeline.processEncounter(user, enc.id, { engine: "local" });
  const r = await pipeline.signEncounter(user, enc.id, { force: true });
  expect(r.signed).toBe(true);
  if (opts.signedAt) await run("UPDATE encounters SET signed_at = ? WHERE id = ?", opts.signedAt, enc.id);
  return { enc, pat };
}

describe("growth", () => {
  it("validates NPIs with the Luhn check", async () => {
    const g = await import("@/lib/server/growth");
    expect(g.npiValid("1234567893")).toBe(true);
    expect(g.npiValid("1234567890")).toBe(false);
    expect(g.npiValid("12345")).toBe(false);
    await expect(g.lookupNpi("1234567890")).rejects.toThrow("valid 10-digit NPI");
    expect(await g.lookupNpi("1497758544")).toBeNull();
    expect(await g.lookupNpi("123-456-7893")).toMatchObject({ first: "Avery", last: "Chen", credential: "MD", specialty: "Family Medicine", state: "IL" });
  });

  it("claims an NPI as self-attested only when the name and state match, once per NPI", async () => {
    const g = await import("@/lib/server/growth");
    const repo = await import("@/lib/server/repo");
    const avery = await newMember("Dr. Avery Chen");
    const miss = await g.claimNpi(avery, { npi: "1234567893", state: "CA" });
    expect(miss).toMatchObject({ matched: false, badge: null });
    expect(miss.reason).toMatch(/registry lists IL/);
    const ok = await g.claimNpi(avery, { npi: "1234567893", state: "IL" });
    expect(ok).toMatchObject({ matched: true, specialty: "Family Medicine" });
    expect(ok.badge).toMatch(/self-attested/);
    expect((await repo.users.byId(avery.id))?.specialty).toBe("Family Medicine");
    const impostor = await newMember("Dr. Someone Else");
    const taken = await g.claimNpi(impostor, { npi: "1234567893" });
    expect(taken).toMatchObject({ matched: false, reason: "This NPI is already on another Chartside account" });
    const wrongName = await g.claimNpi(impostor, { npi: "1245319599" });
    expect(wrongName.reason).toMatch(/registry name is Dana Ruiz/);
    const { run } = await import("@/lib/db");
    await run("UPDATE users SET password_hash = '', name = 'Clinician' WHERE id = ?", impostor.id);
    const adopted = await g.claimNpi((await repo.actorFor(impostor.id))!, { npi: "1245319599", applyName: true });
    expect(adopted.matched).toBe(true);
    expect((await repo.users.byId(impostor.id))?.name).toBe("Dana Ruiz");
  });

  it("gives both sides one flat month when a referred clinician signs a first note, capped for the referrer", async () => {
    const g = await import("@/lib/server/growth");
    const referrer = await newMember("Dr. Referrer");
    const code = await g.referralCode(referrer);
    expect(code).toMatch(/^[a-z0-9]{6}$/);
    expect(await g.referralCode(referrer)).toBe(code);
    expect(g.referralUrl(code)).toBe(`https://chartside.test/r/${code}`);
    expect(await g.attributeReferral(referrer.id, code)).toBe(false);
    const friend = await newMember("Dr. Friend");
    expect(await g.attributeReferral(friend.id, "nope!!")).toBe(false);
    expect(await g.attributeReferral(friend.id, code)).toBe(true);
    expect(await g.attributeReferral(friend.id, code)).toBe(false);
    expect((await g.creditsFor(friend.id)).months).toBe(0);
    await signedVisit(friend, "Pat One");
    expect((await g.creditsFor(friend.id)).months).toBe(1);
    expect((await g.creditsFor(referrer.id))).toMatchObject({ months: 1, fromReferrals: 1, capped: false });
    await signedVisit(friend, "Pat Two");
    expect((await g.creditsFor(friend.id)).months).toBe(1);
    const { run } = await import("@/lib/db");
    for (let i = 0; i < 11; i++) await run("INSERT INTO growth_credits (id, user_id, kind, months, other_user_id, created_at) VALUES (?, ?, 'referrer', 1, ?, ?)", `crd_fill${i}`, referrer.id, `usr_fake${i}`, new Date().toISOString());
    expect((await g.creditsFor(referrer.id)).capped).toBe(true);
    const late = await newMember("Dr. Late");
    await g.attributeReferral(late.id, code);
    await signedVisit(late, "Pat Three");
    expect((await g.creditsFor(late.id)).months).toBe(1);
    expect((await g.creditsFor(referrer.id)).fromReferrals).toBe(12);
    const guest = await (await import("@/lib/server/guest")).createGuest();
    expect(await g.attributeReferral(guest.id, code)).toBe(false);
  });

  it("builds a weekly receipt with no patient information in it", async () => {
    const g = await import("@/lib/server/growth");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Receipt Writer");
    const names = ["Harriet Quimby", "Bessie Coleman", "Amelia Earhart"];
    const day = new Date();
    day.setHours(10, 0, 0, 0);
    if (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() - 2);
    const at = (h: number) => new Date(day.getTime() + (h - 10) * 3600000).toISOString();
    const visits = [
      await signedVisit(doc, names[0], { endedAt: at(10), signedAt: at(10.5) }),
      await signedVisit(doc, names[1], { endedAt: at(11), signedAt: at(11.25) }),
      await signedVisit(doc, names[2], { endedAt: at(14), signedAt: at(21) }),
    ];
    const stats = await g.receiptStats(doc, new Date(day.getTime() + 13 * 3600000));
    expect(stats).toMatchObject({ clinician: "Dr. Writer", notesSigned: 3, closedSameDay: 2, afterHours: 1, hoursBack: 0.6, line: "chartside.test/line" });
    expect(stats.medianMinutesToSign).toBe(30);
    const { token, url, stats: saved } = await g.createReceipt(doc);
    expect(url).toBe(`https://chartside.test/receipt/${token}`);
    const blob = JSON.stringify(await g.receiptByToken(token));
    const forbidden = [...names, ...names.flatMap((n) => n.split(" ")), "1961-07-14", "gout", "ibuprofen", "knee", ...visits.flatMap((v) => [v.enc.id, v.pat.id, v.pat.mrn])];
    for (const f of forbidden) expect(blob.toLowerCase()).not.toContain(f.toLowerCase());
    expect(saved.notesSigned).toBeGreaterThanOrEqual(0);
    await g.revokeReceipt(doc, token);
    expect(await g.receiptByToken(token)).toBeNull();
    expect(await g.receiptByToken("../../etc")).toBeNull();
    const other = await newMember("Dr. Other");
    await expect(g.revokeReceipt(other, token)).rejects.toThrow("not found");
    expect(g.displayName("Avery Chen", "MD")).toBe("Dr. Chen");
    expect(g.displayName("Sam Patel", "PT")).toBe("Sam Patel");
    void repo;
  });

  it("offers the colleague invite once, after the third signed note", async () => {
    const g = await import("@/lib/server/growth");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Inviter");
    for (let i = 0; i < 2; i++) await signedVisit(doc, `Invite Pt ${i}`);
    expect((await g.growthState(doc)).prompts.invite).toBe(false);
    await signedVisit(doc, "Invite Pt 3");
    const state = await g.growthState(doc);
    expect(state.prompts.invite).toBe(true);
    expect(state.signed).toBe(3);
    expect(state.referral.message).toContain(state.referral.url);
    expect(state.referral.message).not.toMatch(/Invite Pt/);
    await g.markPromptSeen(doc, "invite");
    expect((await g.growthState((await repo.actorFor(doc.id))!)).prompts.invite).toBe(false);
    await expect(g.markPromptSeen(doc, "other")).rejects.toThrow("Unknown prompt");
  });

  it("describes how fast a shared note was written, with a referral link and no PHI", async () => {
    const g = await import("@/lib/server/growth");
    const doc = await newMember("Dr. Sharer");
    const { enc } = await signedVisit(doc, "Nellie Bly", { endedAt: new Date(Date.now() - 41000).toISOString() });
    const f = await g.shareFooter(enc.id, doc.id);
    expect(f.written).toMatch(/^Written with Chartside in \d+ seconds$/);
    expect(f.tryUrl).toBe(`/r/${await g.referralCode(doc)}?src=share`);
    expect(JSON.stringify(f)).not.toMatch(/Nellie|Bly/);
  });
});
