import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from "@/lib/server/security";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-sec-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const RFC = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches RFC 4226 and RFC 6238 test vectors", () => {
    expect(RFC).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC).toString()).toBe("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(RFC, c))).toEqual(["755224", "287082", "359152", "520489"]);
    expect(totp(RFC, 59000)).toBe("287082");
    expect(totp(RFC, 1111111109000)).toBe("081804");
    expect(verifyTotp(RFC, "287082", 59000)).toBe(true);
    expect(verifyTotp(RFC, "287082", 59000 + 30000)).toBe(true);
    expect(verifyTotp(RFC, "287082", 59000 + 90000)).toBe(false);
    expect(verifyTotp(RFC, "abc", 59000)).toBe(false);
  });
});

describe("account security", () => {
  it("enrolls MFA, challenges sign-in, accepts a recovery code once, and enforces org policy", async () => {
    const sec = await import("@/lib/server/security");
    const { get } = await import("@/lib/db");
    const owner = await newMember("Dr. Olivia Owner");
    const { secret } = await sec.startEnrollment(owner);
    await expect(sec.confirmEnrollment(owner, "000000")).rejects.toThrow("didn't match");
    await expect(sec.updateOrgSecurity(owner, { requireMfa: true })).rejects.toThrow("your own account first");
    const { recoveryCodes } = await sec.confirmEnrollment(owner, totp(secret));
    expect(recoveryCodes).toHaveLength(10);
    expect((await sec.mfaStatus(owner.id)).enabled).toBe(true);
    const ch = await sec.createChallenge(owner.id, owner.orgId);
    await expect(sec.redeemChallenge(ch, "111111")).rejects.toThrow("didn't match");
    expect(await sec.redeemChallenge(ch, totp(secret))).toEqual({ userId: owner.id, orgId: owner.orgId });
    await expect(sec.redeemChallenge(ch, totp(secret))).rejects.toThrow("expired");
    const ch2 = await sec.createChallenge(owner.id, owner.orgId);
    for (let i = 0; i < 5; i++) await sec.redeemChallenge(ch2, "999999").catch(() => {});
    await expect(sec.redeemChallenge(ch2, totp(secret))).rejects.toThrow("expired");
    expect(await sec.checkSecondFactor(owner.id, recoveryCodes[0])).toBe(true);
    expect(await sec.checkSecondFactor(owner.id, recoveryCodes[0])).toBe(false);
    expect((await sec.mfaStatus(owner.id)).recoveryLeft).toBe(9);
    await sec.updateOrgSecurity(owner, { requireMfa: true, idleMinutes: 15 });
    await expect(sec.disableMfa(owner, totp(secret))).rejects.toThrow("requires two-step");
    await expect(sec.updateOrgSecurity(owner, { idleMinutes: 7 })).rejects.toThrow("Choose 15");
    const stored = await get<{ mfa_secret: string }>("SELECT mfa_secret FROM users WHERE id = ?", owner.id);
    expect(stored!.mfa_secret).not.toContain(secret);
  });

  it("expires idle sessions, lists devices, and signs out everywhere", async () => {
    const repo = await import("@/lib/server/repo");
    const sec = await import("@/lib/server/security");
    const { run } = await import("@/lib/db");
    const u = await newMember("Dr. Idle");
    const a = await repo.sessions.create(u.id, u.orgId, 14, "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36");
    const b = await repo.sessions.create(u.id, u.orgId, 14, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1");
    const list = await sec.listSessions(u, a);
    expect(list.map((s) => s.device).sort()).toEqual(["Chrome on macOS", "Safari on iOS"]);
    expect(list.find((s) => s.current)!.device).toBe("Chrome on macOS");
    await run("UPDATE auth_sessions SET last_seen_at = ? WHERE token = ?", new Date(Date.now() - 31 * 60000).toISOString(), b);
    expect(await repo.sessions.user(b)).toBeUndefined();
    expect((await repo.sessions.user(a))?.id).toBe(u.id);
    const c = await repo.sessions.create(u.id, u.orgId);
    await sec.signOutEverywhere(u, a);
    expect(await repo.sessions.user(c)).toBeUndefined();
    expect((await repo.sessions.user(a))?.id).toBe(u.id);
  });

  it("provisions, updates, deactivates, and removes members over SCIM", async () => {
    const sec = await import("@/lib/server/security");
    const repo = await import("@/lib/server/repo");
    const owner = await newMember("Dr. Scim Owner");
    const token = await sec.rotateScimToken(owner, "clinician");
    const users = await import("@/app/scim/v2/Users/route");
    const one = await import("@/app/scim/v2/Users/[id]/route");
    const req = (method: string, url: string, body?: unknown, t = token) => new Request(`http://localhost${url}`, { method, headers: { authorization: `Bearer ${t}`, "content-type": "application/scim+json" }, body: body ? JSON.stringify(body) : undefined });
    expect((await users.GET(req("GET", "/scim/v2/Users", undefined, "scim_wrong"))).status).toBe(401);
    const created = await users.POST(req("POST", "/scim/v2/Users", { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: "nina.park@lakeside.org", name: { givenName: "Nina", familyName: "Park" }, active: true, "urn:chartside:params:scim:schemas:extension:1.0:User": { role: "nurse" } }));
    expect(created.status).toBe(201);
    const cj = (await created.json()) as { id: string; active: boolean; displayName: string };
    expect(cj).toMatchObject({ active: true, displayName: "Nina Park" });
    expect((await users.POST(req("POST", "/scim/v2/Users", { userName: "nina.park@lakeside.org" }))).status).toBe(409);
    const found = (await (await users.GET(req("GET", `/scim/v2/Users?filter=${encodeURIComponent('userName eq "Nina.Park@lakeside.org"')}`))).json()) as { totalResults: number };
    expect(found.totalResults).toBe(1);
    const nina = (await repo.actorFor(cj.id, owner.orgId))!;
    expect(nina.role).toBe("nurse");
    const tok = await repo.sessions.create(nina.id, owner.orgId);
    const patched = await one.PATCH(req("PATCH", `/scim/v2/Users/${cj.id}`, { Operations: [{ op: "replace", value: { active: false } }] }), { params: Promise.resolve({ id: cj.id }) });
    expect(((await patched.json()) as { active: boolean }).active).toBe(false);
    expect(await repo.sessions.user(tok)).toBeUndefined();
    const ownerPatch = await one.PATCH(req("PATCH", `/scim/v2/Users/${owner.id}`, { Operations: [{ op: "replace", path: "active", value: false }] }), { params: Promise.resolve({ id: owner.id }) });
    expect(ownerPatch.status).toBe(400);
    expect((await one.DELETE(req("DELETE", `/scim/v2/Users/${cj.id}`), { params: Promise.resolve({ id: cj.id }) })).status).toBe(204);
    expect((await one.GET(req("GET", `/scim/v2/Users/${cj.id}`), { params: Promise.resolve({ id: cj.id }) })).status).toBe(404);
  });
});
