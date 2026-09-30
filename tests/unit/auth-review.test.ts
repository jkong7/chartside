import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OutboundMessage } from "@/lib/server/delivery";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-auth-review-"));
const sent: OutboundMessage[] = [];

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://c.test";
  (await import("@/lib/server/delivery")).setTransport(async (m) => (sent.push(m), { status: "sent", transport: "custom" }));
});

afterAll(async () => {
  (await import("@/lib/server/delivery")).setTransport(null);
  rmSync(dir, { recursive: true, force: true });
});

const codeOf = (m: OutboundMessage) => /\b(\d{6})\b/.exec(m.body)![1];
const tokenOf = (m: OutboundMessage) => /\/m\/([A-Za-z0-9_-]+)/.exec(m.body)![1];

async function phoneAccount(phone: string) {
  const m = await import("@/lib/server/magic");
  const g = await import("@/lib/server/guest");
  const guest = await g.guestForPhone(phone);
  await m.requestGuestPhoneClaim(guest);
  return (await m.claimGuestByPhone(guest, codeOf(sent.at(-1)!), {})).user;
}

describe("sign-in review fixes", () => {
  it("never attaches someone else's email to a phone-only account", async () => {
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const victim = await phoneAccount("+13125550101");
    await m.requestEmailSignIn("attacker@evil.test", {});
    const red = await m.redeemMagic({ token: tokenOf(sent.at(-1)!) }, victim);
    expect(red.user.id).not.toBe(victim.id);
    expect((await repo.users.byId(victim.id))!.email).not.toBe("attacker@evil.test");
  });

  it("attaches an email the phone-only account asked for itself", async () => {
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const me = await phoneAccount("+13125550103");
    await m.requestEmailSignIn("me@clinic.test", { requesterId: me.id });
    const red = await m.redeemMagic({ token: tokenOf(sent.at(-1)!) }, me);
    expect(red.user.id).toBe(me.id);
    expect((await repo.users.byId(me.id))!.email).toBe("me@clinic.test");
  });

  it("refuses a texted phone code into an account whose org requires SSO", async () => {
    const m = await import("@/lib/server/magic");
    const g = await import("@/lib/server/guest");
    const repo = await import("@/lib/server/repo");
    const db = await import("@/lib/db");
    const u = await repo.users.create({ email: "doc@ssoclinic.test", name: "Doc", passwordHash: "", specialty: "Family Medicine" });
    const org = await repo.orgs.create("SSO Clinic", u.id);
    await repo.orgs.update(org.id, { settings: { ...org.settings, sso: { enabled: true, issuer: "https://idp.test", clientId: "a", domains: ["ssoclinic.test"], defaultRole: "clinician", jit: true, requireSso: true } } as never });
    await db.run("UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?", "+13125550202", db.now(), u.id);
    const guest = await g.guestForPhone("+13125550202");
    await m.requestGuestPhoneClaim(guest);
    await expect(m.claimGuestByPhone(guest, codeOf(sent.at(-1)!), {})).rejects.toBeInstanceOf(m.SsoRequired);
  });
});

describe("patient visit holders", () => {
  it("can't be sent a sign-in code", async () => {
    const m = await import("@/lib/server/magic");
    await expect(m.requestEmailSignIn("usr_abc@patient.chartside.invalid", {})).rejects.toThrow("Enter a valid email address");
  });
});

describe("next paths after sign-in", () => {
  it("keeps same-site paths and drops tricks that browsers read as another site", async () => {
    const { safePath } = await import("@/lib/server/magic");
    expect(safePath("/go?welcome=1", "")).toBe("/go?welcome=1");
    for (const bad of ["//evil.test", "/\\evil.test", "https://evil.test", "/\\/evil.test"]) expect(safePath(bad, "")).toBe("");
  });
});

describe("an email claimed with a password before its owner proves it", () => {
  it("loses the squatter's password and sessions when the real owner signs in with a code", async () => {
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const { hashPassword } = await import("@/lib/server/auth");
    const db = await import("@/lib/db");
    const squat = await repo.users.create({ email: "victim@clinic.test", name: "Squatter", passwordHash: hashPassword("attacker-pass"), specialty: "Family Medicine" });
    await repo.orgs.create("Squat clinic", squat.id);
    await repo.sessions.create(squat.id, null, 14, null);
    await m.requestEmailSignIn("victim@clinic.test", {});
    const red = await m.redeemMagic({ email: "victim@clinic.test", code: codeOf(sent.at(-1)!) }, null);
    expect(red.user.id).toBe(squat.id);
    const row = await db.get<{ password_hash: string; email_verified_at: string | null }>("SELECT password_hash, email_verified_at FROM users WHERE id = ?", squat.id);
    expect(row!.password_hash).toBe("");
    expect(row!.email_verified_at).toBeTruthy();
    expect((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ?", squat.id))!.n).toBe(0);
  });

  it("keeps the password of an account that already proved its email", async () => {
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const { hashPassword } = await import("@/lib/server/auth");
    const { trustEmail } = await import("@/lib/server/emailProof");
    const db = await import("@/lib/db");
    const u = await repo.users.create({ email: "real@clinic.test", name: "Real", passwordHash: hashPassword("real-pass-123"), specialty: "Family Medicine" });
    await repo.orgs.create("Real clinic", u.id);
    await trustEmail(u.id);
    await m.requestEmailSignIn("real@clinic.test", {});
    await m.redeemMagic({ email: "real@clinic.test", code: codeOf(sent.at(-1)!) }, null);
    expect((await db.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id))!.password_hash).not.toBe("");
  });
});

describe("sign-in browser binding", () => {
  it("matches only the browser that started the sign-in", async () => {
    const { newBinding, bindingMatches } = await import("@/lib/server/oidcBinding");
    const mine = newBinding();
    const theirs = newBinding();
    expect(bindingMatches(mine.hash, mine.value)).toBe(true);
    expect(bindingMatches(mine.hash, theirs.value)).toBe(false);
    expect(bindingMatches(mine.hash, null)).toBe(false);
    expect(bindingMatches(null, mine.value)).toBe(false);
  });
});

describe("password sign-up when email works", () => {
  it("keeps the password on a new account only after its email code is used", async () => {
    const m = await import("@/lib/server/magic");
    const { hashPassword, verifyPassword } = await import("@/lib/server/auth");
    const db = await import("@/lib/db");
    await m.requestEmailSignIn("newdoc@clinic.test", { passwordHash: hashPassword("my-own-pass-1") });
    expect(await db.get("SELECT id FROM users WHERE email = ?", "newdoc@clinic.test")).toBeUndefined();
    const red = await m.redeemMagic({ email: "newdoc@clinic.test", code: codeOf(sent.at(-1)!) }, null);
    const row = await db.get<{ password_hash: string; email_verified_at: string | null }>("SELECT password_hash, email_verified_at FROM users WHERE id = ?", red.user.id);
    expect(row!.email_verified_at).toBeTruthy();
    expect(verifyPassword("my-own-pass-1", row!.password_hash)).toBe(true);
  });

  it("never sets a password on an account that already exists", async () => {
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const { hashPassword } = await import("@/lib/server/auth");
    const { trustEmail } = await import("@/lib/server/emailProof");
    const db = await import("@/lib/db");
    const u = await repo.users.create({ email: "owner@clinic.test", name: "Owner", passwordHash: hashPassword("owner-pass-1"), specialty: "Family Medicine" });
    await repo.orgs.create("Owner clinic", u.id);
    await trustEmail(u.id);
    const before = (await db.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id))!.password_hash;
    await m.requestEmailSignIn("owner@clinic.test", { passwordHash: hashPassword("attacker-pass") });
    await m.redeemMagic({ email: "owner@clinic.test", code: codeOf(sent.at(-1)!) }, null);
    expect((await db.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id))!.password_hash).toBe(before);
  });
});
