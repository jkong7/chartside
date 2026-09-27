import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../db";
import { assignRoles, clusterVoices } from "../engine/diarize";
import { detectLang } from "../engine/lang";
import type { Encounter, Speaker, Utterance } from "../types";
import { artifacts, audioChunks, audit, encounters, utterances, type User } from "./repo";

export const LIVE_PARAMS = "model=nova-3&language=multi&diarize=true&smart_format=true&punctuate=true&interim_results=true&utterance_end_ms=1200&endpointing=300&vad_events=true";

export function deepgramKey() {
  return process.env.CHARTSIDE_SPEECH === "browser" ? null : process.env.DEEPGRAM_API_KEY || null;
}

function deepgramBase() {
  return (process.env.DEEPGRAM_BASE_URL || "https://api.deepgram.com").replace(/\/$/, "");
}

export function speechConfig() {
  const key = deepgramKey();
  return {
    provider: key ? ("deepgram" as const) : ("browser" as const),
    live: !!key,
    finalPass: !!key,
    wsUrl: key ? `${(process.env.DEEPGRAM_WS_URL || "wss://api.deepgram.com/v1/listen").replace(/\/$/, "")}?${LIVE_PARAMS}` : null,
  };
}

export async function mintDeepgramToken(ttlSeconds = 60) {
  const key = deepgramKey();
  if (!key) throw new Error("Deepgram is not configured");
  const res = await fetch(`${deepgramBase()}/v1/auth/grant`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
  });
  if (!res.ok) throw new Error(`Deepgram token request failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  return { token: j.access_token, expiresIn: j.expires_in };
}

function audioDir(encId: string) {
  return path.join(dataDir(), "audio", encId.replace(/[^a-z0-9_]/gi, ""));
}

const ALLOWED_MIME = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;.*)?$/i;

export async function saveChunk(encId: string, seq: number, tMs: number, mime: string, data: Buffer) {
  if (!ALLOWED_MIME.test(mime)) throw new Error("Unsupported audio type");
  if (!Number.isInteger(seq) || seq < 0 || seq > 100000) throw new Error("Invalid chunk sequence");
  if (data.length > 5 * 1024 * 1024) throw new Error("Audio chunk too large");
  const dir = audioDir(encId);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(seq).padStart(6, "0")}.bin`);
  writeFileSync(file, data);
  await audioChunks.add(encId, { seq, tMs: Math.max(0, Math.round(tMs)), bytes: data.length, mime: mime.split(";")[0], path: file });
  return (await audioChunks.list(encId)).length;
}

export async function recording(encId: string) {
  const chunks = await audioChunks.list(encId);
  if (!chunks.length) return null;
  const parts: Buffer[] = [];
  for (const c of chunks) {
    try {
      parts.push(readFileSync(c.path));
    } catch {
      continue;
    }
  }
  if (!parts.length) return null;
  const buffer = Buffer.concat(parts);
  const lastMs = chunks.at(-1)!.tMs;
  return { buffer, mime: chunks[0].mime, chunks: chunks.length, bytes: buffer.length, durationMs: lastMs };
}

export async function deleteAudio(actor: User | null, encId: string, reason: string) {
  const had = (await audioChunks.list(encId)).length;
  if (!had) return false;
  rmSync(audioDir(encId), { recursive: true, force: true });
  await audioChunks.remove(encId);
  await audit.log(actor, encId, "audio.purged", { reason, chunks: had });
  return true;
}

export function retentionDays(user: User) {
  const d = user.prefs.audioRetentionDays;
  return typeof d === "number" && d >= 0 ? d : 0;
}

export async function purgeExpired(user: User) {
  const days = retentionDays(user);
  const before = new Date(Date.now() - days * 86400000).toISOString();
  let n = 0;
  for (const encId of await audioChunks.expired(user.orgId, before)) {
    const e = await encounters.byIdUnscoped(encId);
    if (e && (await deleteAudio(user, encId, days === 0 ? "signed (retention: delete at signing)" : `retention ${days} days`))) n++;
  }
  return n;
}

interface DeepgramUtterance {
  start: number;
  end: number;
  confidence: number;
  channel: number;
  transcript: string;
  speaker?: number;
  words?: { word: string; start: number; end: number; speaker?: number; language?: string; punctuated_word?: string }[];
}

export async function transcribeWithDeepgram(buffer: Buffer, mime: string, lang: string) {
  const key = deepgramKey();
  if (!key) throw new Error("Deepgram is not configured");
  const language = lang === "en" || lang === "es" ? lang : "multi";
  const params = `model=nova-3&smart_format=true&punctuate=true&diarize=true&utterances=true&language=${language}`;
  const res = await fetch(`${deepgramBase()}/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": mime },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`Deepgram transcription failed (${res.status})`);
  const j = (await res.json()) as { results?: { utterances?: DeepgramUtterance[] } };
  return (j.results?.utterances ?? []).filter((u) => u.transcript?.trim());
}

function majorityLang(u: DeepgramUtterance) {
  const counts = new Map<string, number>();
  for (const w of u.words ?? []) if (w.language) counts.set(w.language.slice(0, 2), (counts.get(w.language.slice(0, 2)) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return top;
  const d = detectLang(u.transcript);
  return d === "und" ? null : d;
}

export async function finalPass(user: User, enc: Encounter) {
  if (!deepgramKey()) return { ran: false as const, reason: "no-provider" };
  const rec = await recording(enc.id);
  if (!rec) return { ran: false as const, reason: "no-audio" };
  const started = Date.now();
  const dg = await transcribeWithDeepgram(rec.buffer, rec.mime, enc.inputLang);
  if (!dg.length) return { ran: false as const, reason: "empty" };
  const live = await utterances.list(enc.id);
  const draft: Utterance[] = dg.map((u, i) => ({
    id: `tmp_${i}`,
    seq: i,
    speaker: "patient",
    speakerSource: "auto",
    text: u.transcript.trim(),
    tStart: u.start,
    tEnd: u.end,
    lang: majorityLang(u) ?? enc.inputLang,
    confidence: u.confidence,
    source: "final",
  }));
  const speakerOf = dg.map((u) => String(u.speaker ?? u.words?.[0]?.speaker ?? 0));
  const keys = Array.from(new Set(speakerOf));
  const groups = keys.map((k) => ({ key: k, utterances: draft.filter((_, i) => speakerOf[i] === k) }));
  let roles: Record<string, Speaker> = assignRoles(groups, draft.map((d, i) => ({ ...d, speaker: speakerOf[i] as Speaker })));
  if (keys.length === 1) roles = {};
  const rows = draft.map((d, i) => ({ ...d, speaker: roles[speakerOf[i]] ?? d.speaker }));
  await artifacts.set(enc.id, "live_transcript", live.map((u) => ({ speaker: u.speaker, text: u.text, tStart: u.tStart })));
  const saved = await utterances.replaceAll(
    enc.id,
    rows.map(({ id: _id, seq: _seq, ...rest }) => rest),
  );
  await audit.log(user, enc.id, "transcript.final_pass", { provider: "deepgram", utterances: saved.length, speakers: keys.length, replaced: live.length, ms: Date.now() - started });
  return { ran: true as const, utterances: saved.length, speakers: keys.length };
}

export async function localDiarize(user: User, enc: Encounter) {
  const utts = await utterances.list(enc.id);
  if (utts.some((u) => u.source === "final")) return { ran: false as const };
  const map = clusterVoices(utts);
  if (!map) return { ran: false as const };
  const changes: Record<string, Speaker> = {};
  for (const u of utts) if (u.speakerSource === "auto" && map[u.id] && map[u.id] !== u.speaker) changes[u.id] = map[u.id];
  await utterances.setSpeakers(enc.id, changes);
  await audit.log(user, enc.id, "transcript.diarized", { method: "voice-clustering", relabeled: Object.keys(changes).length });
  return { ran: true as const, relabeled: Object.keys(changes).length };
}
