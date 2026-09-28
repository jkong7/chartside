import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-pair-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("phone pairing", () => {
  it("issues a single-use QR link that only the same clinician can redeem", async () => {
    const repo = await import("@/lib/server/repo");
    const pr = await import("@/lib/server/pairing");
    const doc = await newMember("Dr. Two Devices");
    const other = await newMember("Dr. Someone Else", { orgId: doc.orgId });
    const enc = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), reason: "x" });
    const p = await pr.createPairing(doc, enc.id, "https://app.test");
    expect(p.svg.startsWith("<svg")).toBe(true);
    const token = p.url.split("/pair/")[1];
    await expect(pr.redeemPairing(other, token, "phone")).rejects.toThrow("same clinician");
    expect((await pr.pairingStatus(doc, p.id)).connected).toBe(false);
    expect(await pr.redeemPairing(doc, token, "iPhone")).toBe(enc.id);
    await expect(pr.redeemPairing(doc, token, "iPhone")).rejects.toThrow("already used");
    expect(await pr.pairingStatus(doc, p.id)).toMatchObject({ connected: true, expired: false });
    await expect(pr.redeemPairing(doc, "nope", "x")).rejects.toThrow("expired");
  });
});
