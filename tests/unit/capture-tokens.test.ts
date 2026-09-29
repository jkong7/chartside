import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-captok-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const req = (token: string | null) => new Request("http://localhost/api/capture", { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("capture tokens", () => {
  it("mints short-lived tokens that resolve to the clinician and can be revoked", async () => {
    const t = await import("@/lib/server/captureTokens");
    const { run } = await import("@/lib/db");
    const doc = await newMember("Dr. Capture");
    const minted = await t.mintCaptureToken(doc, { source: "session", label: "iPhone" });
    expect(minted.token).toMatch(/^cs_cap_/);
    expect(minted.scopes).toEqual(["capture:create", "capture:upload", "capture:read"]);
    expect(new Date(minted.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(3600000);
    const actor = await t.captureActor(req(minted.token));
    expect(actor?.user.id).toBe(doc.id);
    expect(actor?.tokenId).toBe(minted.id);
    expect(await t.captureActor(req(null))).toBeNull();
    expect(await t.captureActor(req("cs_live_abcdef12_notacapturetokenatall"))).toBeNull();
    await expect(t.captureActor(req(`cs_cap_${"x".repeat(32)}`))).rejects.toMatchObject({ status: 401 });
    await expect(t.mintCaptureToken(doc, { source: "session", minutes: 2 })).rejects.toThrow("between 5 and 1440");
    await expect(t.mintCaptureToken(doc, { source: "session", minutes: 10000 })).rejects.toThrow("between 5 and 1440");
    await t.revokeCaptureToken(doc, minted.id);
    await expect(t.captureActor(req(minted.token))).rejects.toThrow("revoked");
    const other = await newMember("Dr. Other");
    const second = await t.mintCaptureToken(doc, { source: "session" });
    await expect(t.revokeCaptureToken(other, second.id)).rejects.toThrow("not found");
    await run("UPDATE capture_tokens SET expires_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), second.id);
    await expect(t.captureActor(req(second.token))).rejects.toThrow("expired");
  });

  it("mints 30-day device tokens only from a session, lists and revokes them", async () => {
    const t = await import("@/lib/server/captureTokens");
    const doc = await newMember("Dr. Device");
    const dev = await t.mintCaptureToken(doc, { source: "session", device: true, label: "iPhone Shortcut" });
    const days = (new Date(dev.expiresAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    await expect(t.mintCaptureToken(doc, { source: "api_key", device: true })).rejects.toThrow("signed in");
    await expect(t.mintCaptureToken(doc, { source: "session", minutes: 3 * 24 * 60 })).rejects.toThrow("between 5 and 1440");
    await expect(t.mintCaptureToken(doc, { source: "session", device: true, minutes: 31 * 24 * 60 })).rejects.toThrow("between 5 and 43200");
    const guest = await (await import("@/lib/server/guest")).createGuest();
    await expect(t.mintCaptureToken(guest, { source: "session", device: true })).rejects.toThrow("Save your account");
    const list = await t.listCaptureTokens(doc);
    expect(list.map((x) => x.label)).toEqual(["iPhone Shortcut"]);
    expect(JSON.stringify(list)).not.toContain(dev.token);
    await t.revokeCaptureToken(doc, dev.id);
    expect(await t.listCaptureTokens(doc)).toEqual([]);
  });

  it("refuses roles that cannot record and tokens whose clinician lost access", async () => {
    const t = await import("@/lib/server/captureTokens");
    const repo = await import("@/lib/server/repo");
    const owner = await newMember("Dr. Owner");
    const biller = await newMember("Coder Bea", { orgId: owner.orgId, role: "coder" });
    await expect(t.mintCaptureToken(biller, { source: "session" })).rejects.toThrow();
    const doc = await newMember("Dr. Leaving", { orgId: owner.orgId, role: "clinician" });
    const minted = await t.mintCaptureToken(doc, { source: "session" });
    await repo.orgs.addMember(owner.orgId, doc.id, "coder");
    await expect(t.captureActor(req(minted.token))).rejects.toMatchObject({ status: 403 });
  });

  it("mints from an API key with encounters:write and records the key", async () => {
    const platform = await import("@/lib/server/platform");
    const route = await import("@/app/api/v1/capture/token/route");
    const owner = await newMember("Dr. Keys");
    const { token: good } = await platform.apiKeys.create(owner, { name: "Shortcut", scopes: ["encounters:write"] });
    const { token: weak } = await platform.apiKeys.create(owner, { name: "Reader", scopes: ["encounters:read"] });
    const call = (key: string) => route.POST(new Request("http://localhost/api/v1/capture/token", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ minutes: 30, label: "Voice Memos" }) }), { params: Promise.resolve({}) });
    const ok = await call(good);
    expect(ok.status).toBe(201);
    const j = (await ok.json()) as { data: { token: string } };
    const t = await import("@/lib/server/captureTokens");
    expect((await t.captureActor(req(j.data.token)))?.user.id).toBe(owner.id);
    expect((await call(weak)).status).toBe(403);
  });
});
