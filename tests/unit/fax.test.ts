import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-fax-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  delete process.env.PHAXIO_KEY;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("fax", () => {
  it("validates numbers and logs unconfigured attempts in the outbox", async () => {
    const repo = await import("@/lib/server/repo");
    const nt = await import("@/lib/server/notify");
    const doc = await newMember("Dr. Fax");
    const enc = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), reason: "x" });
    await expect(nt.sendFax(doc, { encounterId: enc.id, to: "12", pdf: Buffer.from("%PDF-1.4"), name: "Letter", kind: "document_fax" })).rejects.toThrow("10-digit");
    const r = await nt.sendFax(doc, { encounterId: enc.id, to: "(312) 555-0199", pdf: Buffer.from("%PDF-1.4"), name: "Letter", kind: "document_fax" });
    expect(r).toMatchObject({ status: "unconfigured", error: "No fax provider is configured" });
    const out = await nt.outboxFor(doc);
    expect(out[0]).toMatchObject({ channel: "fax", recipient: "+13125550199", status: "unconfigured" });
  });
});
