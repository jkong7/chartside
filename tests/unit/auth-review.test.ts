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
