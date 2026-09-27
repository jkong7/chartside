import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-audio-"));
let mock: ChildProcess;
const PORT = 3398;

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.DEEPGRAM_API_KEY = "test-key";
  process.env.DEEPGRAM_BASE_URL = `http://127.0.0.1:${PORT}`;
  mock = spawn(process.execPath, ["tests/e2e/mock-deepgram.mjs"], { env: { ...process.env, MOCK_DG_PORT: String(PORT) }, stdio: "pipe" });
  await new Promise<void>((resolve) => mock.stdout!.on("data", (d) => String(d).includes("mock deepgram") && resolve()));
});

afterAll(() => {
  mock.kill();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.DEEPGRAM_BASE_URL;
});

async function setup() {
  const repo = await import("@/lib/server/repo");
  const user = await newMember("Dr. A");
  const enc = await repo.encounters.create(user, { scheduledAt: new Date().toISOString(), status: "recording", reason: "Cough" });
  return { repo, user, enc };
}

describe("server audio", () => {
  it("stores chunks, stitches the recording, and validates input", async () => {
    const { saveChunk, recording } = await import("@/lib/server/audio");
    const { enc } = await setup();
    expect(await saveChunk(enc.id, 0, 0, "audio/webm;codecs=opus", Buffer.alloc(1200, 1))).toBe(1);
    expect(await saveChunk(enc.id, 1, 4000, "audio/webm", Buffer.alloc(800, 2))).toBe(2);
    expect(await saveChunk(enc.id, 1, 4000, "audio/webm", Buffer.alloc(900, 3))).toBe(2);
    const rec = (await recording(enc.id))!;
    expect(rec.bytes).toBe(2100);
    expect(rec.mime).toBe("audio/webm");
    expect(rec.buffer[0]).toBe(1);
    expect(rec.buffer[2099]).toBe(3);
    await expect(saveChunk(enc.id, 2, 0, "text/html", Buffer.alloc(10))).rejects.toThrow("Unsupported audio type");
    await expect(saveChunk(enc.id, -1, 0, "audio/webm", Buffer.alloc(10))).rejects.toThrow("Invalid chunk sequence");
  });

  it("re-transcribes the full recording with diarization and maps speakers to roles", async () => {
    const { saveChunk, finalPass, speechConfig, mintDeepgramToken } = await import("@/lib/server/audio");
    const { repo, user, enc } = await setup();
    expect(speechConfig().provider).toBe("deepgram");
    expect(speechConfig().wsUrl).toContain("diarize=true");
    expect((await mintDeepgramToken()).token).toBe("mock-jwt");
    await repo.utterances.append(enc.id, [{ speaker: "patient", text: "live caption", tStart: 0, tEnd: 1 }]);
    await saveChunk(enc.id, 0, 0, "audio/webm", Buffer.alloc(5000, 7));
    const out = await finalPass(user, enc);
    expect(out).toEqual({ ran: true, utterances: 6, speakers: 2 });
    const utts = await repo.utterances.list(enc.id);
    expect(utts.map((x) => x.speaker)).toEqual(["clinician", "patient", "clinician", "patient", "clinician", "clinician"]);
    expect(utts.every((x) => x.source === "final" && x.lang === "en")).toBe(true);
    expect(utts[1].tStart).toBe(3);
    expect(await repo.artifacts.get<unknown[]>(enc.id, "live_transcript")).toHaveLength(1);
    expect((await repo.audit.forEncounter(enc.id)).map((a) => a.action)).toContain("transcript.final_pass");
  });

  it("purges audio per the retention policy", async () => {
    const { saveChunk, purgeExpired, recording } = await import("@/lib/server/audio");
    const { repo, user, enc } = await setup();
    await saveChunk(enc.id, 0, 0, "audio/webm", Buffer.alloc(3000, 1));
    await repo.users.update(user.id, { prefs: { audioRetentionDays: 7 } });
    await repo.encounters.update(user, enc.id, { status: "signed", signedAt: new Date(Date.now() - 2 * 86400000).toISOString() });
    expect(await purgeExpired((await repo.actorFor(user.id))!)).toBe(0);
    expect(await recording(enc.id)).not.toBeNull();
    await repo.users.update(user.id, { prefs: { audioRetentionDays: 0 } });
    expect(await purgeExpired((await repo.actorFor(user.id))!)).toBe(1);
    expect(await recording(enc.id)).toBeNull();
    expect((await repo.audit.forEncounter(enc.id)).map((a) => a.action)).toContain("audio.purged");
  });
});
