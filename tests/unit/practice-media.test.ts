import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-practice-media-"));
let server: Server;
const spoken: string[] = [];
const systems: string[] = [];

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.url?.startsWith("/v1/speak")) {
        spoken.push(JSON.parse(raw).text);
        return res.writeHead(200, { "content-type": "audio/basic" }).end(Buffer.alloc(800, 0x7f));
      }
      if (req.url?.startsWith("/v1/messages")) {
        systems.push(JSON.parse(raw).system);
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude", content: [{ type: "text", text: "It feels like a weight on my chest." }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.DEEPGRAM_API_KEY = "unit-key";
  process.env.DEEPGRAM_BASE_URL = base;
  process.env.DEEPGRAM_WS_URL = "ws://127.0.0.1:1/v1/listen";
  process.env.ANTHROPIC_API_KEY = "unit-key";
  process.env.ANTHROPIC_BASE_URL = base;
  delete process.env.CHARTSIDE_ENGINE;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
  for (const k of ["DEEPGRAM_API_KEY", "DEEPGRAM_BASE_URL", "DEEPGRAM_WS_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]) delete process.env[k];
});

const device = () => `dev${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.padEnd(20, "x");
const P = () => import("@/lib/server/practice");

describe("practice speech grants", () => {
  it("only grants speech for the live stage, caps it per session, and never hands out a Deepgram key", async () => {
    const p = await P();
    const sp = await import("@/lib/server/practiceSpeech");
    const me = { device: device(), userId: null };
    const s = await p.startPractice({ caseId: "chest-pain", actor: me });
    await expect(sp.grantSpeech(s, "note")).rejects.toThrow(/already graded|note/);
    const g = await sp.grantSpeech(s, "encounter");
    expect(g).toMatchObject({ provider: "deepgram", url: "/api/voice/practice", voice: true });
    expect(g.token).not.toContain("unit-key");
    await sp.grantSpeech(s, "encounter");
    await sp.grantSpeech(s, "encounter");
    expect(await sp.grantSpeech(s, "encounter")).toEqual({ provider: "browser", url: null, token: null, voice: false });
    const ended = await p.endPractice(s.id, me);
    await expect(sp.grantSpeech(ended, "encounter")).rejects.toThrow(/ended/);
    const graded = await p.submitNote(s.id, me, "");
    await expect(sp.grantSpeech(graded, "note")).rejects.toThrow(/already graded/);
  });

  it("stops granting speech past the daily cap, which survives a restart of the in-memory limiter", async () => {
    const p = await P();
    const sp = await import("@/lib/server/practiceSpeech");
    const { resetLimits } = await import("@/lib/server/ratelimit");
    const { run } = await import("@/lib/db");
    await run("DELETE FROM usage_daily WHERE kind = 'practice-speech'");
    process.env.CHARTSIDE_PRACTICE_SPEECH_DAILY = "2";
    const grants = [];
    for (let i = 0; i < 3; i++) {
      resetLimits();
      const s = await p.startPractice({ caseId: "headache", actor: { device: device(), userId: null } });
      grants.push((await sp.grantSpeech(s, "encounter")).provider);
    }
    delete process.env.CHARTSIDE_PRACTICE_SPEECH_DAILY;
    expect(grants).toEqual(["deepgram", "deepgram", "browser"]);
  });

  it("accepts a listen ticket once, for a live session, and routes it to the practice tag", async () => {
    const p = await P();
    const sp = await import("@/lib/server/practiceSpeech");
    const s = await p.startPractice({ caseId: "chest-pain", actor: { device: device(), userId: null } });
    const g = await sp.grantSpeech(s, "encounter");
    const req = (proto: string) => ({ headers: { "sec-websocket-protocol": proto } }) as never;
    expect(await sp.acceptListen(req(`bearer, not-a-ticket`))).toBeNull();
    const ok = await sp.acceptListen(req(`bearer, ${g.token}`));
    expect(ok?.url).toMatch(/^ws:\/\/127\.0\.0\.1:1\/v1\/listen\?.*&tag=chartside-practice$/);
    expect(ok!.maxMs).toBeGreaterThan(0);
    expect(await sp.acceptListen(req(`bearer, ${g.token}`))).toBeNull();
    const next = await sp.grantSpeech(s, "encounter");
    await p.endPractice(s.id, { device: s.device, userId: null });
    expect(await sp.acceptListen(req(`bearer, ${next.token}`))).toBeNull();
  });
});