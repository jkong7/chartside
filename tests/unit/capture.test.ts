import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-capture-"));
let mock: ChildProcess;
const PORT = 3401;

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
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

type Handler = (r: Request, c: { params: Promise<unknown> }) => Promise<Response>;

async function call(h: Handler, url: string, init: RequestInit & { token?: string } = {}, params: Record<string, string> = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  const res = await h(new Request(`http://localhost${url}`, { ...init, headers }), { params: Promise.resolve(params) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

async function routes() {
  return {
    root: (await import("@/app/api/capture/route")) as unknown as { POST: Handler },
    one: (await import("@/app/api/capture/[id]/route")) as unknown as { GET: Handler; POST: Handler },
    note: (await import("@/app/api/capture/[id]/note/route")) as unknown as { GET: Handler },
  };
}

async function tokenFor(name: string) {
  const { mintCaptureToken } = await import("@/lib/server/captureTokens");
  const doc = await newMember(name);
  return { doc, token: (await mintCaptureToken(doc, { source: "session" })).token };
}

const audio = Buffer.alloc(9000, 7);

describe("capture API", () => {
  it("normalizes audio types from headers and file names", async () => {
    const { normalizeMime } = await import("@/lib/server/capture");
    expect(normalizeMime("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizeMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeMime("audio/wave")).toBe("audio/wav");
    expect(normalizeMime("application/octet-stream", "Visit 12.m4a")).toBe("audio/mp4");
    expect(normalizeMime("", "memo.wav")).toBe("audio/wav");
    expect(normalizeMime("text/plain", "x.m4a")).toBeNull();
    expect(normalizeMime("image/png")).toBeNull();
  });

  it("takes a raw upload, records consent, drafts in the background, and serves status and note", async () => {
    const { root, one, note } = await routes();
    const { settleCaptures } = await import("@/lib/server/capture");
    const repo = await import("@/lib/server/repo");
    const { doc, token } = await tokenFor("Dr. Raw");
    const r = await call(root.POST, "/api/capture?consent=granted&state=IL&reason=Cough&durationS=22", { method: "POST", token, body: audio, headers: { "content-type": "audio/x-m4a" } });
    expect(r.status).toBe(202);
    expect(r.json).toMatchObject({ status: "processing", statusUrl: `/api/capture/${r.json.encounterId}`, noteUrl: `/api/capture/${r.json.encounterId}/note`, reviewUrl: `/encounters/${r.json.encounterId}` });
    const id = r.json.encounterId as string;
    const early = await call(note.GET, `/api/capture/${id}/note`, { token }, { id });
    expect([200, 409]).toContain(early.status);
    await settleCaptures();
    const s = await call(one.GET, `/api/capture/${id}`, { token }, { id });
    expect(s.json).toMatchObject({ encounterId: id, status: "ready", error: null, audioBytes: audio.length });
    const n = await call(note.GET, `/api/capture/${id}/note`, { token }, { id });
    expect(n.status).toBe(200);
    expect(n.json.text).toMatch(/cough/i);
    expect(n.json.sections.length).toBeGreaterThan(1);
    expect(n.json.codes.diagnoses.length).toBeGreaterThan(0);
    expect(n.json.signUrl).toBe(`/api/encounters/${id}/sign`);
    const enc = (await repo.encounters.get(doc, id))!;
    expect(enc.patientId).toBeNull();
    expect(enc.reason).toBe("Cough");
    expect((await repo.consents.latest(id))?.decision).toBe("granted");
    const chunks = await repo.audioChunks.list(id);
    expect(chunks[0].mime).toBe("audio/mp4");
    expect(readFileSync(chunks[0].path).subarray(0, 4).toString()).toBe("CSB1");
    const actions = (await repo.audit.forEncounter(id)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["capture.started", "consent.granted", "capture.drafted"]));
  });

  it("accepts multipart uploads and chunked uploads finished later", async () => {
    const { root, one } = await routes();
    const { settleCaptures } = await import("@/lib/server/capture");
    const repo = await import("@/lib/server/repo");
    const { token } = await tokenFor("Dr. Multi");
    const form = new FormData();
    form.set("consent", "granted");
    form.set("state", "TX");
    form.set("audio", new Blob([audio], { type: "application/octet-stream" }), "memo.m4a");
    const m = await call(root.POST, "/api/capture", { method: "POST", token, body: form });
    expect(m.status).toBe(202);
    await settleCaptures();
    expect((await call(one.GET, `/api/capture/${m.json.encounterId}`, { token }, { id: m.json.encounterId })).json.status).toBe("ready");

    const start = await call(root.POST, "/api/capture?consent=granted&finish=false", { method: "POST", token, body: Buffer.alloc(5 * 1024 * 1024, 1), headers: { "content-type": "audio/webm" } });
    expect(start.json.status).toBe("recording");
    const id = start.json.encounterId as string;
    expect((await repo.audioChunks.list(id)).length).toBe(2);
    const wrongType = await call(one.POST, `/api/capture/${id}`, { method: "POST", token, body: audio, headers: { "content-type": "audio/wav" } }, { id });
    expect(wrongType.status).toBe(422);
    const more = await call(one.POST, `/api/capture/${id}`, { method: "POST", token, body: audio, headers: { "content-type": "audio/webm" } }, { id });
    expect(more.json).toMatchObject({ status: "recording", audioBytes: 5 * 1024 * 1024 + audio.length });
    expect((await repo.audioChunks.list(id)).map((c) => c.seq)).toEqual([0, 1, 2]);
    const fin = await call(one.POST, `/api/capture/${id}?finish=true`, { method: "POST", token }, { id });
    expect(fin.json.status).toBe("processing");
    const again = await call(one.POST, `/api/capture/${id}?finish=true`, { method: "POST", token }, { id });
    expect(again.status).toBe(409);
    await settleCaptures();
    expect((await call(one.GET, `/api/capture/${id}`, { token }, { id })).json.status).toBe("ready");
  });

  it("rejects bad requests with clear statuses", async () => {
    const { root } = await routes();
    const { token } = await tokenFor("Dr. Strict");
    const post = (url: string, init: RequestInit & { token?: string } = {}) => call(root.POST, url, { method: "POST", token, ...init });
    expect((await call(root.POST, "/api/capture?consent=granted", { method: "POST", body: audio, headers: { "content-type": "audio/webm" } })).status).toBe(401);
    expect((await post("/api/capture?consent=granted", { token: `cs_cap_${"z".repeat(32)}`, body: audio, headers: { "content-type": "audio/webm" } })).status).toBe(401);
    const noConsent = await post("/api/capture", { body: audio, headers: { "content-type": "audio/webm" } });
    expect(noConsent.status).toBe(422);
    expect(noConsent.json.error).toMatch(/consent=granted/);
    expect((await post("/api/capture?consent=granted", { body: audio, headers: { "content-type": "text/html" } })).status).toBe(415);
    expect((await post("/api/capture?consent=granted", { body: Buffer.alloc(0), headers: { "content-type": "audio/webm" } })).status).toBe(422);
    expect((await post("/api/capture?consent=granted&state=ZZ", { body: audio, headers: { "content-type": "audio/webm" } })).status).toBe(422);
    const allParty = await post("/api/capture?consent=granted&state=CA&othersPresent=true", { body: audio, headers: { "content-type": "audio/webm" } });
    expect(allParty.status).toBe(422);
    expect(allParty.json.error).toMatch(/allPartiesConfirmed/);
    expect((await post("/api/capture?consent=granted&state=CA&othersPresent=true&allPartiesConfirmed=true", { body: audio, headers: { "content-type": "audio/webm" } })).status).toBe(202);
    expect((await post("/api/capture?consent=granted", { body: audio, headers: { "content-type": "audio/webm", "content-length": String(200 * 1024 * 1024) } })).status).toBe(413);
  });

  it("records into a scheduled visit or for a known patient", async () => {
    const cap = await import("@/lib/server/capture");
    const repo = await import("@/lib/server/repo");
    const { seedDemo } = await import("@/lib/server/seed");
    const doc = await newMember("Dr. Scheduled");
    await seedDemo(doc);
    const scheduled = (await repo.encounters.list(doc)).find((e) => e.status === "scheduled" && e.patientId)!;
    const r = await cap.captureAudio(doc, { bytes: audio, mime: "audio/webm", options: { consent: "granted", state: "IL", encounterId: scheduled.id } });
    expect(r.encounterId).toBe(scheduled.id);
    await cap.settleCaptures();
    const done = (await repo.encounters.get(doc, scheduled.id))!;
    expect(done.status).toBe("review");
    expect(done.patientId).toBe(scheduled.patientId);
    await expect(cap.captureAudio(doc, { bytes: audio, mime: "audio/webm", options: { consent: "granted", encounterId: scheduled.id } })).rejects.toThrow("already been recorded");
    const other = await newMember("Dr. Colleague", { orgId: doc.orgId, role: "clinician" });
    const next = (await repo.encounters.list(doc)).find((e) => e.status === "scheduled" && e.id !== scheduled.id)!;
    await expect(cap.captureAudio(other, { bytes: audio, mime: "audio/webm", options: { consent: "granted", encounterId: next.id } })).rejects.toThrow("not found");
    const stranger = await newMember("Dr. Elsewhere");
    await expect(cap.captureAudio(stranger, { bytes: audio, mime: "audio/webm", options: { consent: "granted", encounterId: next.id } })).rejects.toThrow("not found");
    const withPatient = await cap.captureAudio(doc, { bytes: audio, mime: "audio/webm", options: { consent: "granted", patientId: scheduled.patientId!, finish: false } });
    expect((await repo.encounters.get(doc, withPatient.encounterId))?.patientId).toBe(scheduled.patientId);
    await expect(cap.captureAudio(stranger, { bytes: audio, mime: "audio/webm", options: { consent: "granted", patientId: scheduled.patientId! } })).rejects.toThrow("Patient not found");
  });

  it("lets a device key upload and check status but not read the note", async () => {
    const { root, one, note } = await routes();
    const { settleCaptures } = await import("@/lib/server/capture");
    const { mintCaptureToken } = await import("@/lib/server/captureTokens");
    const doc = await newMember("Dr. Device Reader");
    const { token } = await mintCaptureToken(doc, { source: "session", device: true, label: "iPhone Shortcut" });
    const r = await call(root.POST, "/api/capture?consent=granted", { method: "POST", token, body: audio, headers: { "content-type": "audio/mp4" } });
    const id = r.json.encounterId as string;
    await settleCaptures();
    expect((await call(one.GET, `/api/capture/${id}`, { token }, { id })).json.status).toBe("ready");
    const n = await call(note.GET, `/api/capture/${id}/note`, { token }, { id });
    expect(n.status).toBe(403);
    expect(n.json.error).toMatch(/Device keys/);
  });

  it("lets a texted upload link send one recording, never read the note, and text the link when ready", async () => {
    const { root, one, note } = await routes();
    const { settleCaptures } = await import("@/lib/server/capture");
    const { listCaptureTokens, mintUploadToken } = await import("@/lib/server/captureTokens");
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const magic = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Upload Once");
    await magic.verifyPhone(doc.id, "+15550180001");
    const u = (await repo.actorFor(doc.id, doc.orgId))!;
    const { token } = await mintUploadToken(u, 30);
    expect(await listCaptureTokens(u)).toHaveLength(0);
    const r = await call(root.POST, "/api/capture?consent=granted&encounterId=enc_other", { method: "POST", token, body: audio, headers: { "content-type": "audio/mp4" } });
    expect(r.status).toBe(202);
    const id = r.json.encounterId as string;
    await settleCaptures();
    expect((await call(one.GET, `/api/capture/${id}`, { token }, { id })).json.status).toBe("ready");
    expect((await call(note.GET, `/api/capture/${id}/note`, { token }, { id })).status).toBe(403);
    expect((await call(one.POST, `/api/capture/${id}`, { method: "POST", token, body: audio, headers: { "content-type": "audio/mp4" } }, { id })).status).toBe(403);
    const again = await call(root.POST, "/api/capture?consent=granted", { method: "POST", token, body: audio, headers: { "content-type": "audio/mp4" } });
    expect(again.status).toBe(410);
    expect(again.json.error).toMatch(/already used/);
    expect((await repo.encounters.list(u, {})).length).toBe(1);
    expect(simMessages("+15550180001").map((m: { body: string }) => m.body).join("\n")).toMatch(/is ready\. Review and sign: /);
  });

  it("scopes a token to the captures it created", async () => {
    const { root, one, note } = await routes();
    const { settleCaptures } = await import("@/lib/server/capture");
    const { mintCaptureToken } = await import("@/lib/server/captureTokens");
    const { doc, token } = await tokenFor("Dr. Scope");
    const sibling = (await mintCaptureToken(doc, { source: "session" })).token;
    const { token: stranger } = await tokenFor("Dr. Stranger");
    const r = await call(root.POST, "/api/capture?consent=granted", { method: "POST", token, body: audio, headers: { "content-type": "audio/webm" } });
    const id = r.json.encounterId as string;
    await settleCaptures();
    expect((await call(one.GET, `/api/capture/${id}`, { token: stranger }, { id })).status).toBe(404);
    expect((await call(note.GET, `/api/capture/${id}/note`, { token: sibling }, { id })).status).toBe(404);
    expect((await call(one.POST, `/api/capture/${id}`, { method: "POST", token: stranger, body: audio, headers: { "content-type": "audio/webm" } }, { id })).status).toBe(404);
  });

  it("marks the capture failed when drafting throws, and exposes in-process helpers", async () => {
    const cap = await import("@/lib/server/capture");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Inproc");
    const started = await cap.captureAudio(doc, { mime: "audio/wav", options: { consent: "granted", state: "IL", channel: "phone", finish: false } });
    expect(started.status).toBe("recording");
    const id = started.encounterId;
    await cap.appendCaptureAudio(doc, id, { stream: (async function* () { yield new Uint8Array(4000).fill(3); yield new Uint8Array(4000).fill(4); })(), mime: "audio/wav" });
    expect((await repo.audioChunks.list(id)).length).toBe(1);
    expect((await repo.artifacts.get<{ channel: string }>(id, "capture_origin"))?.channel).toBe("phone");
    process.env.DEEPGRAM_BASE_URL = "http://127.0.0.1:1";
    const prevEngine = process.env.CHARTSIDE_ENGINE;
    await cap.finishCaptureFor(doc, id);
    await cap.settleCaptures();
    process.env.DEEPGRAM_BASE_URL = `http://127.0.0.1:${PORT}`;
    process.env.CHARTSIDE_ENGINE = prevEngine;
    const s = await cap.captureStatus({ user: doc, tokenId: null }, id);
    expect(s.status).toBe("failed");
    expect(s.error).toBeTruthy();
    await expect(cap.captureNote({ user: doc, tokenId: null }, id)).rejects.toThrow("Drafting failed");
    await cap.finishCaptureFor(doc, id);
    await cap.settleCaptures();
    expect((await cap.captureStatus({ user: doc, tokenId: null }, id)).status).toBe("ready");
  });
});
