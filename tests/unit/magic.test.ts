import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OutboundMessage } from "@/lib/server/delivery";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-magic-"));
const sent: OutboundMessage[] = [];

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://chartside.test";
  (await import("@/lib/server/delivery")).setTransport(async (m) => {
    sent.push(m);
    return { status: "sent", transport: "custom" };
  });
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  (await import("@/lib/server/delivery")).setTransport(null);
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CHARTSIDE_PUBLIC_URL;
});

const codeOf = (m: OutboundMessage) => /\b(\d{6})\b/.exec(m.body)![1];
const tokenOf = (m: OutboundMessage) => /\/m\/([A-Za-z0-9_-]+)/.exec(m.body)![1];
const unique = (p: string) => `${p}+${Date.now()}${Math.random().toString(36).slice(2, 6)}@clinic.test`;

describe("magic sign-in", () => {
  it("keeps redirects on this site", async () => {
    const { safePath } = await import("@/lib/server/magic");
    expect(safePath("/go/review/enc_1?x=1")).toBe("/go/review/enc_1?x=1");
    expect(safePath("//evil.com/x")).toBe("/today");
    expect(safePath("/\\evil.com")).toBe("/today");
    expect(safePath("https://evil.com")).toBe("/today");
    expect(safePath("javascript:alert(1)")).toBe("/today");
    expect(safePath(undefined, "/go")).toBe("/go");
  });

  it("creates an account from an emailed code, once, and signs in an existing account by link", async () => {
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const email = unique("dana.ruiz");
    const r = await m.requestEmailSignIn(email.toUpperCase(), { next: "/go" });
    expect(r.email).toMatch(/^d•••@clinic\.test$/);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: "email", to: email, kind: "magic_code" });
    expect(sent[0].body).toContain("https://chartside.test/m/");
    await expect(m.redeemMagic({ email, code: "000000" === codeOf(sent[0]) ? "111111" : "000000" }, null)).rejects.toThrow("isn't right");
    const ok = await m.redeemMagic({ email, code: codeOf(sent[0]) }, null);
    expect(ok.created).toBe(true);
    expect(ok.next).toBe("/go");
    expect(ok.user.email).toBe(email);
    expect(ok.user.name).toBe("Dana Ruiz");
    expect(ok.user.role).toBe("owner");
    expect((await repo.users.byEmail(email))?.password_hash).toBe("");
    await expect(m.redeemMagic({ token: tokenOf(sent[0]) }, null)).rejects.toThrow("already used");
    await expect(m.requestEmailSignIn(email)).rejects.toThrow("Wait 30 seconds");
    const { run } = await import("@/lib/db");
    await run("UPDATE magic_links SET created_at = ? WHERE email = ?", new Date(Date.now() - 60000).toISOString(), email);
    await m.requestEmailSignIn(email);
    expect(await m.linkInfo(tokenOf(sent[1]))).toMatchObject({ valid: true, kind: "email" });
    const again = await m.redeemMagic({ token: tokenOf(sent[1]) }, null);
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(ok.user.id);
    expect(await m.linkInfo(tokenOf(sent[1]))).toMatchObject({ valid: false });
  });

  it("locks out after five wrong codes and rejects expired codes", async () => {
    const m = await import("@/lib/server/magic");
    const { run } = await import("@/lib/db");
    const email = unique("lock");
    await m.requestEmailSignIn(email);
    const right = codeOf(sent[0]);
    const wrong = right === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await expect(m.redeemMagic({ email, code: wrong }, null)).rejects.toThrow();
    await expect(m.redeemMagic({ email, code: right }, null)).rejects.toThrow("Too many tries");
    const email2 = unique("expired");
    await m.requestEmailSignIn(email2);
    await run("UPDATE magic_links SET expires_at = ? WHERE email = ?", new Date(Date.now() - 1000).toISOString(), email2);
    await expect(m.redeemMagic({ email: email2, code: codeOf(sent[1]) }, null)).rejects.toThrow("expired");
    await expect(m.redeemMagic({ token: tokenOf(sent[1]) }, null)).rejects.toThrow("expired");
  });

  it("refuses SSO-only domains and guest addresses", async () => {
    const m = await import("@/lib/server/magic");
    const { run } = await import("@/lib/db");
    const owner = await newMember("Dr. Sso");
    await run("UPDATE organizations SET settings = ? WHERE id = ?", JSON.stringify({ sso: { enabled: true, required: true, domains: ["ssoonly.test"], issuer: "https://idp.test", clientId: "x" } }), owner.orgId);
    const repo = await import("@/lib/server/repo");
    if (await repo.orgs.requiringSso("ssoonly.test")) await expect(m.requestEmailSignIn("a@ssoonly.test")).rejects.toBeInstanceOf(m.SsoRequired);
    await expect(m.requestEmailSignIn("usr_x@guest.chartside.invalid")).rejects.toThrow("valid email");
  });

  it("mints single-use login links for a user and can verify the phone that received it", async () => {
    const m = await import("@/lib/server/magic");
    const doc = await newMember("Dr. Link");
    const link = await m.mintLoginLink(doc.id, "/go/review/enc_9", 15, { verifiesPhone: "(312) 555-0101" });
    expect(link.url).toBe(`https://chartside.test/m/${link.token}`);
    expect(await m.userByPhone("+13125550101")).toBeNull();
    const r = await m.redeemMagic({ token: link.token }, null);
    expect(r.user.id).toBe(doc.id);
    expect(r.next).toBe("/go/review/enc_9");
    expect((await m.userByPhone("312-555-0101"))?.id).toBe(doc.id);
    await expect(m.redeemMagic({ token: link.token }, null)).rejects.toThrow("already used");
    const evil = await m.mintLoginLink(doc.id, "https://evil.test/");
    expect((await m.redeemMagic({ token: evil.token }, null)).next).toBe("/today");
    await expect(m.mintLoginLink("usr_missing", "/go")).rejects.toThrow("not found");
  });

  it("verifies a phone by SMS code and keeps each verified number on one account", async () => {
    const m = await import("@/lib/server/magic");
    const a = await newMember("Dr. Phone A");
    const b = await newMember("Dr. Phone B");
    await expect(m.requestPhoneVerification(a, "12")).rejects.toThrow("area code");
    expect((await m.requestPhoneVerification(a, "773 555 0142")).phone).toBe("+•••••••0142");
    expect(sent[0]).toMatchObject({ channel: "sms", to: "+17735550142", kind: "phone_code" });
    await expect(m.confirmPhoneVerification(b, codeOf(sent[0]))).rejects.toThrow("expired");
    await m.confirmPhoneVerification(a, codeOf(sent[0]));
    expect((await m.userByPhone("+17735550142"))?.id).toBe(a.id);
    await expect(m.requestPhoneVerification(b, "7735550142")).rejects.toThrow("another Chartside account");
    await expect(m.verifyPhone(b.id, "+17735550142")).rejects.toThrow("another Chartside account");
    expect(await m.verifyPhone(b.id, "+17735550199")).toBe("+17735550199");
    expect((await m.userByPhone("+17735550199"))?.id).toBe(b.id);
  });
});

describe("phone PIN", () => {
  it("rejects weak PINs, verifies with scrypt, and locks after five misses", async () => {
    const m = await import("@/lib/server/magic");
    const { get } = await import("@/lib/db");
    const doc = await newMember("Dr. Pin");
    expect(await m.hasPhonePin(doc.id)).toBe(false);
    expect(await m.verifyPhonePin(doc.id, "4821")).toBe(false);
    for (const bad of ["12", "1234567", "abcd", "1111", "1234", "9876", "4567"]) await expect(m.setPhonePin(doc.id, bad)).rejects.toThrow();
    await m.setPhonePin(doc.id, "4821");
    expect(await m.hasPhonePin(doc.id)).toBe(true);
    expect((await get<{ phone_pin_hash: string }>("SELECT phone_pin_hash FROM users WHERE id = ?", doc.id))?.phone_pin_hash).toMatch(/^scrypt\$/);
    expect(await m.verifyPhonePin(doc.id, "4821")).toBe(true);
    for (let i = 0; i < 4; i++) expect(await m.verifyPhonePin(doc.id, "0000")).toBe(false);
    expect(await m.verifyPhonePin(doc.id, "4821")).toBe(true);
    for (let i = 0; i < 5; i++) expect(await m.verifyPhonePin(doc.id, "0000")).toBe(false);
    expect(await m.phonePinLocked(doc.id)).toBe(true);
    expect(await m.verifyPhonePin(doc.id, "4821")).toBe(false);
    await m.setPhonePin(doc.id, "5930");
    expect(await m.phonePinLocked(doc.id)).toBe(false);
    expect(await m.verifyPhonePin(doc.id, "5930")).toBe(true);
  });
});

describe("try first, claim later", () => {
  it("lets a guest record, blocks signing and sharing, then claims into a new account", async () => {
    const g = await import("@/lib/server/guest");
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const { signEncounter } = await import("@/lib/server/pipeline");
    const guest = await g.createGuest();
    expect(g.isGuest(guest)).toBe(true);
    expect(guest.role).toBe("owner");
    const enc = await repo.encounters.create(guest, { scheduledAt: new Date().toISOString(), status: "review" });
    await expect(signEncounter(guest, enc.id)).rejects.toThrow("Save your note");
    const platform = await import("@/lib/server/platform");
    await expect(platform.apiKeys.create(guest, { name: "x", scopes: ["encounters:read"] })).rejects.toThrow("Save your note");
    const sharing = await import("@/lib/server/sharing");
    await expect(sharing.shareExternal(guest, enc.id, { email: "x@y.test" }, "http://x")).rejects.toThrow("Save your note");
    const email = unique("new.claimer");
    await m.requestEmailSignIn(email, { guestUserId: guest.id });
    const r = await m.redeemMagic({ email, code: codeOf(sent[0]) }, guest);
    expect(r.user.id).toBe(guest.id);
    expect(r.user.guestUntil).toBeNull();
    expect(r.user.email).toBe(email);
    expect(r.claimed).toBe(1);
    expect(r.user.orgName).toBe("New Claimer's practice");
    expect((await repo.encounters.get(r.user, enc.id))?.userId).toBe(guest.id);
  });

  it("merges a guest's visits into an existing account and moves a verified phone", async () => {
    const g = await import("@/lib/server/guest");
    const m = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const existing = await newMember("Dr. Existing", { email: unique("existing") });
    const guest = await g.guestForPhone("+16305550111");
    expect(guest.phone).toBeNull();
    expect((await g.guestForPhone("+16305550111")).id).toBe(guest.id);
    const enc = await repo.encounters.create(guest, { scheduledAt: new Date().toISOString(), status: "review" });
    const link = await m.mintLoginLink(guest.id, "/go/claim", 15, { verifiesPhone: "+16305550111" });
    const asGuest = await m.redeemMagic({ token: link.token }, null);
    expect(asGuest.user.id).toBe(guest.id);
    expect(asGuest.user.phone).toBe("+16305550111");
    await m.requestEmailSignIn(existing.email);
    const r = await m.redeemMagic({ email: existing.email, code: codeOf(sent[0]) }, asGuest.user);
    expect(r.user.id).toBe(existing.id);
    expect(r.claimed).toBe(1);
    const moved = await repo.encounters.get(existing, enc.id);
    expect(moved?.userId).toBe(existing.id);
    expect(moved?.orgId).toBe(existing.orgId);
    expect(await repo.users.byId(guest.id)).toBeFalsy();
    expect((await m.userByPhone("+16305550111"))?.id).toBe(existing.id);
  });

  it("purges unclaimed guests with their visits and audio after the window", async () => {
    const g = await import("@/lib/server/guest");
    const repo = await import("@/lib/server/repo");
    const { saveChunk } = await import("@/lib/server/audio");
    const { existsSync } = await import("node:fs");
    const guest = await g.createGuest();
    const keeper = await g.createGuest();
    const enc = await repo.encounters.create(guest, { scheduledAt: new Date().toISOString(), status: "recording" });
    await saveChunk(enc.id, 0, 0, "audio/webm", Buffer.alloc(100, 1));
    const [chunk] = await repo.audioChunks.list(enc.id);
    const later = new Date(Date.now() + g.guestHours() * 3600000 + 1000).toISOString();
    const { run } = await import("@/lib/db");
    await run("UPDATE users SET guest_expires_at = ? WHERE id = ?", new Date(Date.now() + 10 * 3600000).toISOString(), keeper.id);
    expect(await g.purgeGuests(later)).toBeGreaterThanOrEqual(1);
    expect(existsSync(chunk.path)).toBe(false);
    expect(await repo.users.byId(guest.id)).toBeFalsy();
    expect(await repo.encounters.byIdUnscoped(enc.id)).toBeFalsy();
    expect(await repo.users.byId(keeper.id)).toBeTruthy();
  });

  it("keeps a guest whose recording is still receiving audio, and extends their window", async () => {
    const g = await import("@/lib/server/guest");
    const repo = await import("@/lib/server/repo");
    const { captureAudio } = await import("@/lib/server/capture");
    const { run, get } = await import("@/lib/db");
    const guest = await g.createGuest();
    await run("UPDATE users SET guest_expires_at = ? WHERE id = ?", new Date(Date.now() + 60_000).toISOString(), guest.id);
    const r = await captureAudio(guest, { bytes: Buffer.alloc(2000, 1), mime: "audio/webm", options: { consent: "granted", finish: false } });
    const until = (await get<{ guest_expires_at: string }>("SELECT guest_expires_at FROM users WHERE id = ?", guest.id))!.guest_expires_at;
    expect(Date.parse(until)).toBeGreaterThan(Date.now() + 3600_000);
    await run("UPDATE users SET guest_expires_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), guest.id);
    await g.purgeGuests(new Date().toISOString());
    expect(await repo.users.byId(guest.id)).toBeTruthy();
    expect(await repo.encounters.byIdUnscoped(r.encounterId)).toBeTruthy();
  });

  it("names accounts from email addresses", async () => {
    const { nameFromEmail } = await import("@/lib/server/guest");
    expect(nameFromEmail("maria.lopez@x.test")).toBe("Maria Lopez");
    expect(nameFromEmail("drk77@x.test")).toBe("Drk");
    expect(nameFromEmail("123@x.test")).toBe("Clinician");
    expect(nameFromEmail("sam.lee+chartside@x.test")).toBe("Sam Lee");
  });
});
