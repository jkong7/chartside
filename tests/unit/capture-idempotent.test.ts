import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-idem-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("retried uploads", () => {
  it("reuse the visit for a repeated first chunk and ignore repeated chunk numbers", async () => {
    const { startCapture, appendCapture } = await import("@/lib/server/capture");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Flaky Wifi");
    const auth = { user: doc, tokenId: null };
    const chunk = (n: number) => Buffer.alloc(3000, n);
    const opts = (seq: number) => ({ consent: "granted", finish: "false", channel: "go", cid: "visit-abc-12345678", seq: String(seq) });
    const a = await startCapture(auth, { audio: chunk(1), mime: "audio/webm", opts: opts(0) });
    const again = await startCapture(auth, { audio: chunk(1), mime: "audio/webm", opts: opts(0) });
    expect(again.encounterId).toBe(a.encounterId);
    await appendCapture(auth, a.encounterId, { audio: chunk(2), mime: "audio/webm", opts: opts(1) });
    await appendCapture(auth, a.encounterId, { audio: chunk(2), mime: "audio/webm", opts: opts(1) });
    await appendCapture(auth, a.encounterId, { audio: chunk(3), mime: "audio/webm", opts: opts(2) });
    const chunks = await repo.audioChunks.list(a.encounterId);
    expect(chunks.reduce((n, c) => n + c.bytes, 0)).toBe(9000);
    const other = await newMember("Dr. Other");
    const theirs = await startCapture({ user: other, tokenId: null }, { audio: chunk(4), mime: "audio/webm", opts: opts(0) });
    expect(theirs.encounterId).not.toBe(a.encounterId);
  });
});
