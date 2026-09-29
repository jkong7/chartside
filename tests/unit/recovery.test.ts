import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-recovery-"));
const sent: { to: string; body: string }[] = [];

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://line.test";
  delete process.env.DEEPGRAM_API_KEY;
  const { setTransport } = await import("@/lib/server/delivery");
  setTransport(async (m) => (sent.push({ to: m.to, body: m.body }), { status: "sent", transport: "custom", id: "t" }));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("stalled capture recovery", () => {
  it("finishes a dropped phone visit that stopped receiving audio and texts the caller", async () => {
    const { captureAudio, settleCaptures } = await import("@/lib/server/capture");
    const { recoverStalledCaptures } = await import("@/lib/server/recovery");
    const { run } = await import("@/lib/db");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Dropped Call");
    const wav = readFileSync("tests/e2e/fixtures/visit.wav");
    const r = await captureAudio(doc, { bytes: wav, mime: "audio/wav", options: { consent: "granted", finish: false, channel: "phone" } });
    await repo.utterances.append(r.encounterId, [{ speaker: "clinician", text: "Your lungs sound clear, this looks like a viral cough.", tStart: 0, tEnd: 3 }]);
    await repo.artifacts.set(r.encounterId, "phone_call", { callSid: "CA1", phone: "+13125550177", startedAt: new Date().toISOString(), verifiedBy: "pin" });
    expect(await recoverStalledCaptures()).toEqual([]);
    await run("UPDATE audio_chunks SET created_at = ? WHERE encounter_id = ?", new Date(Date.now() - 30 * 60_000).toISOString(), r.encounterId);
    expect(await recoverStalledCaptures()).toEqual([r.encounterId]);
    await settleCaptures();
    const enc = await repo.encounters.get(doc, r.encounterId);
    expect(["processing", "review"]).toContain(enc!.status);
    expect(sent.at(-1)!.to).toBe("+13125550177");
    expect(sent.at(-1)!.body).toMatch(/^Chartside: your .* call dropped before it ended\. The note is being written from what was recorded: https:\/\/line\.test\/m\//);
    expect(await recoverStalledCaptures()).toEqual([]);
  });

  it("leaves a capture alone while audio is still arriving", async () => {
    const { captureAudio } = await import("@/lib/server/capture");
    const { recoverStalledCaptures } = await import("@/lib/server/recovery");
    const doc = await newMember("Dr. Still Talking");
    const r = await captureAudio(doc, { bytes: readFileSync("tests/e2e/fixtures/visit.wav"), mime: "audio/wav", options: { consent: "granted", finish: false, channel: "go" } });
    expect(await recoverStalledCaptures()).not.toContain(r.encounterId);
  });

  it("never retries a failed draft and never finishes a paused browser recording early", async () => {
    const { captureAudio } = await import("@/lib/server/capture");
    const { recoverStalledCaptures } = await import("@/lib/server/recovery");
    const { run } = await import("@/lib/db");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Careful Sweep");
    const wav = readFileSync("tests/e2e/fixtures/visit.wav");
    const failed = await captureAudio(doc, { bytes: wav, mime: "audio/wav", options: { consent: "granted", finish: false, channel: "phone" } });
    const origin = await repo.artifacts.get<Record<string, unknown>>(failed.encounterId, "capture_origin");
    await repo.artifacts.set(failed.encounterId, "capture_origin", { ...origin, error: "Deepgram transcription failed (400)" });
    const paused = await captureAudio(doc, { bytes: wav, mime: "audio/wav", options: { consent: "granted", finish: false, channel: "go" } });
    const old = new Date(Date.now() - 45 * 60_000).toISOString();
    await run("UPDATE audio_chunks SET created_at = ? WHERE encounter_id IN (?, ?)", old, failed.encounterId, paused.encounterId);
    const out = await recoverStalledCaptures();
    expect(out).not.toContain(failed.encounterId);
    expect(out).not.toContain(paused.encounterId);
    const ancient = new Date(Date.now() - 6 * 3600_000).toISOString();
    await run("UPDATE audio_chunks SET created_at = ? WHERE encounter_id = ?", ancient, paused.encounterId);
    expect(await recoverStalledCaptures()).toContain(paused.encounterId);
  });
});
