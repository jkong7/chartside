import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import WebSocket from "ws";
import { seal, unseal } from "../fhir/crypto";
import { deepgramKey, speechConfig } from "./audio";
import { elapsed, envCount, getPractice, spendSession, type PracticeSession } from "./practice";
import { Invalid } from "./policy";
import { spendDaily } from "./ratelimit";

export type SpeechPurpose = "encounter" | "note" | "present";

export const LISTEN_PATH = "/api/voice/practice";

export function speechPurpose(v: unknown): SpeechPurpose {
  return v === "note" || v === "present" ? v : "encounter";
}

export function speechOpen(s: PracticeSession, purpose: SpeechPurpose) {
  if (purpose === "encounter") return s.status === "active";
  if (purpose === "note") return s.status === "noting";
  return s.status !== "active" && !s.presentation?.pimp;
}

const browserOnly = { provider: "browser" as const, url: null, token: null, voice: false };

export async function grantSpeech(s: PracticeSession, purpose: SpeechPurpose) {
  if (!speechOpen(s, purpose)) throw new Invalid(purpose === "encounter" ? "This encounter has ended, so the microphone is off." : purpose === "note" ? "Your note is already graded." : "Finish the encounter before you present.");
  if (!speechConfig().wsUrl) return browserOnly;
  if (!(await spendSession(s.id, "speech_tokens", envCount("CHARTSIDE_PRACTICE_SPEECH_PER_SESSION", 3)))) return browserOnly;
  if (!(await spendDaily("practice-speech", envCount("CHARTSIDE_PRACTICE_SPEECH_DAILY", 2000)))) return browserOnly;
  const ticket = seal(JSON.stringify({ s: s.id, p: purpose, exp: Date.now() + 60_000, n: randomBytes(9).toString("base64url") }));
  return { provider: "deepgram" as const, url: LISTEN_PATH, token: ticket, voice: purpose === "encounter" };
}

const used = new Map<string, number>();

export interface ListenGrant {
  url: string;
  maxMs: number;
}

export async function acceptListen(req: IncomingMessage): Promise<ListenGrant | null> {
  const protos = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
  if (protos[0] !== "bearer" || !protos[1]) return null;
  let t: { s?: string; p?: string; exp?: number; n?: string };
  try {
    t = JSON.parse(unseal(protos[1]));
  } catch {
    return null;
  }
  const at = Date.now();
  if (!t.s || !t.n || !t.exp || t.exp < at || used.has(t.n)) return null;
  for (const [k, exp] of used) if (exp < at) used.delete(k);
  used.set(t.n, t.exp);
  const s = await getPractice(t.s);
  const purpose = speechPurpose(t.p);
  const cfg = speechConfig();
  if (!s || !cfg.wsUrl || !speechOpen(s, purpose)) return null;
  const maxMs = purpose === "encounter" ? Math.max(0, s.timeLimitS + 30 - elapsed(s)) * 1000 : 10 * 60_000;
  return { url: `${cfg.wsUrl}&tag=chartside-practice${purpose === "encounter" ? "" : `-${purpose}`}`, maxMs };
}

export function pipeListen(client: WebSocket, grant: ListenGrant) {
  const key = deepgramKey();
  if (!key || grant.maxMs <= 0) return client.close(1008, "Speech is unavailable");
  const up = new WebSocket(grant.url, { headers: { Authorization: `Token ${key}` } });
  const queue: { data: WebSocket.RawData; binary: boolean }[] = [];
  const stop = (w: WebSocket) => {
    if (w.readyState === WebSocket.OPEN) w.close();
    else if (w.readyState === WebSocket.CONNECTING) w.terminate();
  };
  const timer = setTimeout(() => {
    stop(client);
    stop(up);
  }, grant.maxMs);
  client.on("message", (data, binary) => {
    if (up.readyState === WebSocket.OPEN) up.send(data, { binary });
    else if (up.readyState === WebSocket.CONNECTING && queue.length < 200) queue.push({ data, binary });
  });
  up.on("open", () => {
    for (const q of queue.splice(0)) up.send(q.data, { binary: q.binary });
  });
  up.on("message", (data, binary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
  });
  up.on("error", () => stop(client));
  client.on("error", () => stop(up));
  up.on("close", () => {
    clearTimeout(timer);
    stop(client);
  });
  client.on("close", () => {
    clearTimeout(timer);
    stop(up);
  });
}
