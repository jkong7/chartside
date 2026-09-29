import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-loops-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

type U = import("@/lib/server/repo").User;

async function capturedAndSigned(user: U, opts: { draftSeconds?: number } = {}) {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const { run } = await import("@/lib/db");
  const enc = await repo.encounters.create(user, { scheduledAt: new Date().toISOString(), status: "recording" });
  await repo.artifacts.set(enc.id, "capture_origin", { tokenId: null, userId: user.id, channel: "phone", createdAt: new Date().toISOString() });
  await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(enc.id, [
    { speaker: "clinician", text: "What brings you in?", tStart: 0, tEnd: 2 },
    { speaker: "patient", text: "A dry cough for five days.", tStart: 3, tEnd: 5 },
    { speaker: "clinician", text: "Lungs are clear. Viral bronchitis. Fluids and rest, follow up in a week.", tStart: 6, tEnd: 10 },
  ]);
  await repo.encounters.update(user, enc.id, { status: "processing" });
  await pipeline.processEncounter(user, enc.id, { engine: "local" });
  if (opts.draftSeconds) {
    await run("UPDATE encounters SET created_at = ? WHERE id = ?", new Date(Date.now() - opts.draftSeconds * 1000).toISOString(), enc.id);
    await run("UPDATE notes SET created_at = ? WHERE encounter_id = ?", new Date().toISOString(), enc.id);
  }
  expect((await pipeline.signEncounter(user, enc.id, { force: true })).signed).toBe(true);
  return enc;
}

describe("growth loops", () => {
  it("dedupes repeat exposures and clicks from the same visitor, and one signup per user", async () => {
    const l = await import("@/lib/server/loops");
    const inviter = await newMember("Dr. Loop Inviter");
    const v = l.visitorKey("browser-1");
    expect(v).toMatch(/^[a-f0-9]{24}$/);
    expect(await l.trackLoop({ loop: "share", kind: "exposure", inviterId: inviter.id, visitor: v })).toBe(true);
    expect(await l.trackLoop({ loop: "share", kind: "exposure", inviterId: inviter.id, visitor: v })).toBe(false);
    expect(await l.trackLoop({ loop: "share", kind: "exposure", inviterId: inviter.id, visitor: l.visitorKey("browser-2") })).toBe(true);
    expect(await l.trackLoop({ loop: "nonsense", kind: "click" })).toBe(true);
    const friend = await newMember("Dr. Loop Friend");
    expect(await l.recordSignup(friend.id, { loop: "share", inviterId: inviter.id })).toBe("share");
    expect(await l.recordSignup(friend.id, { loop: "receipt", inviterId: inviter.id })).toBe("share");
    const m = await l.loopMetrics({ orgId: inviter.orgId });
    expect(m.funnel.find((f) => f.loop === "share")).toMatchObject({ exposure: 2, signup: 1 });
    const other = await l.loopMetrics({ orgId: friend.orgId });
    expect(other.funnel.find((f) => f.loop === "share")).toBeUndefined();
    const all = await l.loopMetrics({ orgId: null });
    expect(all.funnel.find((f) => f.loop === "direct")?.click).toBeGreaterThanOrEqual(1);
  });

  it("parses loop cookies safely", async () => {
    const l = await import("@/lib/server/loops");
    expect(l.decodeLoopCookie(l.encodeLoopCookie("receipt", "usr_abc123"))).toEqual({ loop: "receipt", inviterId: "usr_abc123" });
    expect(l.decodeLoopCookie("receipt.' OR 1=1")).toEqual({ loop: "receipt", inviterId: null });
    expect(l.decodeLoopCookie("evil.usr_x")).toBeNull();
    expect(l.decodeLoopCookie(undefined)).toBeNull();
  });

  it("attributes phone guests who claim, and counts activation at three signed notes in a week", async () => {
    const l = await import("@/lib/server/loops");
    const g = await import("@/lib/server/guest");
    const m = await import("@/lib/server/magic");
    const { setTransport } = await import("@/lib/server/delivery");
    const { get } = await import("@/lib/db");
    const sent: string[] = [];
    setTransport(async (msg) => {
      sent.push(msg.body);
      return { status: "sent", transport: "custom" };
    });
    const guest = await g.guestForPhone(`+1312555${String(Date.now()).slice(-4)}`);
    expect((await get<{ acq_loop: string }>("SELECT acq_loop FROM users WHERE id = ?", guest.id))?.acq_loop).toBe("phone_guest");
    const email = `claim+${Date.now()}@clinic.test`;
    await m.requestEmailSignIn(email, { guestUserId: guest.id });
    const r = await m.redeemMagic({ email, code: /\b(\d{6})\b/.exec(sent[0])![1] }, guest);
    expect(r.created).toBe(true);
    expect(await l.recordSignup(r.user.id, null)).toBe("phone_guest");
    const user = r.user;
    await capturedAndSigned(user, { draftSeconds: 40 });
    await capturedAndSigned(user);
    expect((await get<{ n: number }>("SELECT COUNT(*) AS n FROM loop_events WHERE kind = 'activation' AND user_id = ?", user.id))?.n).toBe(0);
    await capturedAndSigned(user);
    expect((await get<{ loop_id: string }>("SELECT loop_id FROM loop_events WHERE kind = 'activation' AND user_id = ?", user.id))?.loop_id).toBe("phone_guest");
    await capturedAndSigned(user);
    expect((await get<{ n: number }>("SELECT COUNT(*) AS n FROM loop_events WHERE kind = 'activation' AND user_id = ?", user.id))?.n).toBe(1);
    const metrics = await l.loopMetrics({ orgId: user.orgId });
    expect(metrics.funnel.find((f) => f.loop === "phone_guest")).toMatchObject({ signup: 1, activation: 1 });
    expect(metrics.activation).toMatchObject({ activated: 1 });
    expect(metrics.ttfv.medianSeconds).not.toBeNull();
    expect(metrics.ttfv.medianSeconds!).toBeGreaterThanOrEqual(35);
    setTransport(null);
  });

  it("computes K as signups per active inviter per week", async () => {
    const l = await import("@/lib/server/loops");
    const a = await newMember("Dr. K One");
    const b = await newMember("Dr. K Two", { orgId: a.orgId, role: "clinician" });
    for (const [inv, vis] of [[a, "1"], [a, "2"], [b, "3"]] as const) await l.trackLoop({ loop: "invite", kind: "click", inviterId: inv.id, visitor: l.visitorKey(`k${vis}`) });
    for (let i = 0; i < 3; i++) {
      const n = await newMember(`Dr. Recruit ${i}`);
      await l.recordSignup(n.id, { loop: "invite", inviterId: i < 2 ? a.id : b.id });
    }
    const m = await l.loopMetrics({ orgId: a.orgId });
    const thisWeek = m.k.filter((x) => x.loop === "invite").at(-1)!;
    expect(thisWeek).toMatchObject({ inviters: 2, signups: 3, k: 1.5 });
  });

  it("only lists configured operators", async () => {
    const l = await import("@/lib/server/loops");
    process.env.CHARTSIDE_OPERATOR_EMAILS = "ops@chartside.test, founder@chartside.test";
    expect(l.isOperator("Founder@chartside.test")).toBe(true);
    expect(l.isOperator("doc@clinic.test")).toBe(false);
    delete process.env.CHARTSIDE_OPERATOR_EMAILS;
    expect(l.isOperator("ops@chartside.test")).toBe(false);
  });
});
