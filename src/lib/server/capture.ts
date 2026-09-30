import { after } from "next/server";
import { pushToUser } from "./push";
import { noteToText } from "../engine/note";
import { ALL_PARTY_STATES, STATE_NAMES } from "../engine/lexicon";
import type { CodingResult, ConsentRecord, Encounter, PatientSummary } from "../types";
import { saveChunk } from "./audio";
import { purgeGuests, touchGuest } from "./guest";
import { get } from "../db";
import { CaptureAuthError, captureActor } from "./captureTokens";
import { currentUser } from "./auth";
import { fail } from "./http";
import { processEncounter, recordConsent } from "./pipeline";
import { assertCan, Forbidden, Invalid } from "./policy";
import { artifacts, audioChunks, audit, consents, encounters, notes, patients, utterances, type User } from "./repo";

export const MAX_CAPTURE_BYTES = 100 * 1024 * 1024;
const CHUNK_BYTES = 4 * 1024 * 1024;

const MIME: Record<string, string> = {
  "audio/webm": "audio/webm",
  "video/webm": "audio/webm",
  "audio/mp4": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "video/mp4": "audio/mp4",
  "audio/aac": "audio/aac",
  "audio/wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/ogg": "audio/ogg",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/3gpp": "audio/3gpp",
  "video/3gpp": "audio/3gpp",
  "audio/3gpp2": "audio/3gpp2",
  "video/3gpp2": "audio/3gpp2",
  "audio/amr": "audio/amr",
  "audio/amr-nb": "audio/amr",
  "audio/x-amr": "audio/amr",
  "audio/opus": "audio/ogg",
  "video/quicktime": "audio/mp4",
  "audio/x-caf": "audio/x-caf",
};

const EXT: Record<string, string> = { webm: "audio/webm", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", "3gp": "audio/3gpp", "3gpp": "audio/3gpp", "3g2": "audio/3gpp2", amr: "audio/amr", mov: "audio/mp4", caf: "audio/x-caf" };

export function normalizeMime(type: string | null | undefined, filename?: string | null) {
  const base = (type ?? "").split(";")[0].trim().toLowerCase();
  if (MIME[base]) return MIME[base];
  const ext = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  if ((!base || base === "application/octet-stream") && EXT[ext]) return EXT[ext];
  return null;
}

export interface CaptureInput {
  audio: Buffer | null;
  mime: string | null;
  opts: Record<string, string>;
}

export interface CaptureAuth {
  user: User;
  tokenId: string | null;
  device?: boolean;
}

interface CaptureOrigin {
  tokenId: string | null;
  userId: string;
  channel: string;
  createdAt: string;
  error?: string;
  warnings?: string[];
  finishedAt?: string;
  cid?: string;
  lastSeq?: number;
}

const cleanCid = (v: string | undefined) => (v && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : undefined);

const g = globalThis as unknown as { __chartsideCaptureLocks?: Map<string, Promise<unknown>> };
const locks = (g.__chartsideCaptureLocks ??= new Map<string, Promise<unknown>>());

async function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}
const seqOf = (v: string | undefined) => (v !== undefined && /^\d{1,6}$/.test(v) ? Number(v) : undefined);

export async function readCaptureRequest(req: Request): Promise<CaptureInput> {
  const url = new URL(req.url);
  const opts: Record<string, string> = Object.fromEntries(url.searchParams.entries());
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_CAPTURE_BYTES + 64 * 1024) throw new CaptureAuthError(413, "Recording is larger than 100 MB");
  const type = req.headers.get("content-type") ?? "";
  if (/^multipart\/form-data/i.test(type)) {
    const form = await req.formData();
    let audio: Buffer | null = null;
    let mime: string | null = null;
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") opts[k] = v;
      else if (k === "audio" || (!audio && k === "file")) {
        audio = Buffer.from(await v.arrayBuffer());
        mime = normalizeMime(v.type, v.name);
        if (!mime) throw new CaptureAuthError(415, "Send webm, m4a, mp4, wav, ogg, mp3 or aac audio");
      }
    }
    return { audio: audio?.length ? audio : null, mime, opts };
  }
  if (!type || /^application\/(json|x-www-form-urlencoded)/i.test(type)) {
    if (type.startsWith("application/json")) Object.assign(opts, Object.fromEntries(Object.entries(((await req.json().catch(() => ({}))) as Record<string, unknown>) ?? {}).map(([k, v]) => [k, String(v)])));
    return { audio: null, mime: null, opts };
  }
  const mime = normalizeMime(type, opts.filename);
  if (!mime) throw new CaptureAuthError(415, "Send webm, m4a, mp4, wav, ogg, mp3 or aac audio");
  const audio = Buffer.from(await req.arrayBuffer());
  return { audio: audio.length ? audio : null, mime, opts };
}

const truthy = (v: string | undefined) => v === "1" || v === "true" || v === "yes" || v === "on";
const falsy = (v: string | undefined) => v === "0" || v === "false" || v === "no" || v === "off";

async function storeAudio(encId: string, audio: Buffer, mime: string, durationS: number | null) {
  const owner = await get<{ user_id: string }>("SELECT user_id FROM encounters WHERE id = ?", encId);
  if (owner) await touchGuest(owner.user_id);
  if (audio.length > MAX_CAPTURE_BYTES) throw new CaptureAuthError(413, "Recording is larger than 100 MB");
  const existing = await audioChunks.list(encId);
  if (existing.length && existing[0].mime !== mime) throw new Invalid(`This visit is recording ${existing[0].mime}; send the rest in the same format`);
  const already = existing.reduce((n, c) => n + c.bytes, 0);
  if (already + audio.length > MAX_CAPTURE_BYTES) throw new CaptureAuthError(413, "Recording is larger than 100 MB");
  let seq = existing.length ? existing.at(-1)!.seq + 1 : 0;
  const baseMs = existing.at(-1)?.tMs ?? 0;
  for (let off = 0; off < audio.length; off += CHUNK_BYTES) {
    const t = durationS ? baseMs + Math.round((off / audio.length) * durationS * 1000) : baseMs;
    await saveChunk(encId, seq++, t, mime, audio.subarray(off, off + CHUNK_BYTES));
  }
  return already + audio.length;
}

const inflight = new Set<Promise<void>>();

export async function settleCaptures() {
  while (inflight.size) await Promise.all([...inflight]);
}

function background(fn: () => Promise<void>) {
  const p = fn().finally(() => inflight.delete(p));
  inflight.add(p);
  try {
    after(() => p);
  } catch {
    return;
  }
}

type DraftHook = (r: { ok: true; encounterIds: string[] } | { ok: false; error: string }) => Promise<void> | void;
const hooks = ((globalThis as unknown as { __chartsideDraftHooks?: Map<string, DraftHook> }).__chartsideDraftHooks ??= new Map<string, DraftHook>());

export function onDrafted(encId: string, fn: DraftHook) {
  hooks.set(encId, fn);
}

async function fireHook(encId: string, r: Parameters<DraftHook>[0]) {
  const fn = hooks.get(encId);
  if (!fn) return;
  hooks.delete(encId);
  try {
    await fn(r);
  } catch (err) {
    console.error("draft hook failed", err instanceof Error ? err.message : err);
  }
}

export async function captureTyped(user: User, text: string, opts: { channel: string; reason?: string; templateId?: string; onDrafted?: DraftHook }) {
  assertCan(user, "clinical.capture");
  await purgeGuests();
  const lines = text.split(/(?<=[.!?])\s+|\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Invalid("Nothing to write a note from");
  const at = new Date().toISOString();
  const enc = await encounters.create(user, { scheduledAt: at, status: "recording", patientId: null, visitType: "follow-up", reason: (opts.reason ?? "").slice(0, 200), templateId: opts.templateId || undefined });
  await encounters.update(user, enc.id, { status: "recording", startedAt: at });
  await artifacts.set(enc.id, "capture_origin", { tokenId: null, userId: user.id, channel: opts.channel.slice(0, 30), createdAt: at } satisfies CaptureOrigin);
  await utterances.replaceAll(enc.id, lines.map((t, i) => ({ speaker: "clinician" as const, speakerSource: "manual" as const, text: t.slice(0, 2000), tStart: i * 4, tEnd: i * 4 + 3, source: "typed" as const })));
  await audit.log(user, enc.id, "capture.typed", { channel: opts.channel, lines: lines.length });
  if (opts.onDrafted) onDrafted(enc.id, opts.onDrafted);
  await draft(user, (await encounters.get(user, enc.id))!, opts.templateId ? { templateId: opts.templateId } : {});
  return { encounterId: enc.id };
}

async function draft(user: User, enc: Encounter, opts: Record<string, string>) {
  const detail = ["concise", "standard", "detailed"].includes(opts.detail) ? (opts.detail as "concise" | "standard" | "detailed") : undefined;
  const origin = (await artifacts.get<CaptureOrigin>(enc.id, "capture_origin"))!;
  await encounters.update(user, enc.id, { status: "processing", endedAt: enc.endedAt ?? new Date().toISOString() });
  await artifacts.set(enc.id, "capture_origin", { ...origin, error: undefined, finishedAt: new Date().toISOString() });
  background(async () => {
    try {
      const phone = origin.channel === "phone" || origin.channel === "phone-sim";
      const r = await processEncounter(user, enc.id, { templateId: opts.templateId || undefined, detail, model: phone ? process.env.CHARTSIDE_PHONE_NOTE_MODEL || undefined : undefined });
      await artifacts.set(enc.id, "capture_origin", { ...origin, finishedAt: new Date().toISOString(), warnings: r.warnings });
      await audit.log(user, enc.id, "capture.drafted", { tokenId: origin.tokenId, warnings: r.warnings.length });
      const at = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.CHARTSIDE_TZ || "America/Chicago" }).format(new Date(enc.startedAt ?? enc.scheduledAt));
      await pushToUser(user.id, { title: "Note ready", body: `Your ${at} visit is written. Tap to review and sign.`, url: `/go/stack?focus=${enc.id}`, tag: enc.id }).catch(() => undefined);
      await fireHook(enc.id, { ok: true, encounterIds: r.encounterIds ?? [enc.id] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not draft the note";
      await encounters.update(user, enc.id, { status: "paused" });
      await artifacts.set(enc.id, "capture_origin", { ...origin, error: message });
      await audit.log(user, enc.id, "capture.failed", { tokenId: origin.tokenId, error: message });
      await fireHook(enc.id, { ok: false, error: message });
    }
  });
}

async function targetEncounter(user: User, o: Record<string, string>, startedAt: string, lang: string) {
  if (o.encounterId) {
    const enc = await encounters.get(user, o.encounterId);
    if (!enc) throw new Error("Encounter not found");
    if (enc.userId !== user.id && user.role !== "scribe") throw new Forbidden("You can only record your own visits");
    if (enc.status !== "scheduled") throw new Invalid(enc.status === "signed" ? "This visit is signed" : "This visit has already been recorded");
    if (await artifacts.get(enc.id, "capture_origin")) throw new Invalid("This visit has already been recorded");
    return enc;
  }
  if (o.patientId && !(await patients.get(user, o.patientId))) throw new Error("Patient not found");
  return encounters.create(user, { scheduledAt: startedAt, status: "recording", patientId: o.patientId || null, visitType: (o.visitType || "follow-up") as Encounter["visitType"], reason: (o.reason || "").slice(0, 200), templateId: o.templateId || undefined, inputLang: lang });
}

export async function startCapture(auth: CaptureAuth, input: CaptureInput) {
  const cid = cleanCid(input.opts.cid);
  return cid ? serialized(`cid:${auth.user.id}:${cid}`, () => startCaptureNow(auth, input)) : startCaptureNow(auth, input);
}

async function startCaptureNow(auth: CaptureAuth, input: CaptureInput) {
  const { user, tokenId } = auth;
  assertCan(user, "clinical.capture");
  const cid = cleanCid(input.opts.cid);
  if (cid) {
    const prior = await get<{ encounter_id: string }>("SELECT a.encounter_id FROM artifacts a JOIN encounters e ON e.id = a.encounter_id WHERE a.kind = 'capture_origin' AND e.user_id = ? AND a.content LIKE ?", user.id, `%"cid":"${cid}"%`);
    if (prior) return appendCapture(auth, prior.encounter_id, input);
  }
  await purgeGuests();
  const o = input.opts;
  if (o.consent !== "granted") throw new Invalid("Record the patient's consent: send consent=granted. If the patient declined, don't record.");
  const state = (o.state || user.prefs.state || "IL").toUpperCase();
  if (!STATE_NAMES[state]) throw new Invalid("Unknown state");
  const othersPresent = truthy(o.othersPresent);
  if (ALL_PARTY_STATES.has(state) && othersPresent && !truthy(o.allPartiesConfirmed)) throw new Invalid(`${STATE_NAMES[state]} requires every person in the room to consent. Send allPartiesConfirmed=true once they have.`);
  const method = (["verbal", "written", "patient-device", "text-confirmed", "standing"].includes(o.method) ? o.method : "verbal") as ConsentRecord["method"];
  const finish = !falsy(o.finish);
  if (finish && !input.audio) throw new Invalid("Send the recording in the request body, or finish=false to upload it in parts");
  const durationS = Number(o.durationS) > 0 ? Math.round(Number(o.durationS)) : null;
  const lang = ["en", "es", "multi"].includes(o.lang) ? o.lang : "en";
  const startedAt = new Date(Date.now() - (durationS ?? 0) * 1000).toISOString();
  const enc = await targetEncounter(user, o, startedAt, lang);
  await encounters.update(user, enc.id, { status: "recording", startedAt, ...(durationS ? { durationS } : {}), ...(o.templateId ? { templateId: o.templateId } : {}) });
  await artifacts.set(enc.id, "capture_origin", { tokenId, userId: user.id, channel: (o.channel || (tokenId ? "token" : "session")).slice(0, 30), createdAt: new Date().toISOString(), ...(cid ? { cid, lastSeq: input.audio && seqOf(o.seq) !== undefined ? seqOf(o.seq) : -1 } : {}) } satisfies CaptureOrigin);
  await recordConsent(user, enc, { decision: "granted", method, state, othersPresent });
  const bytes = input.audio ? await storeAudio(enc.id, input.audio, input.mime!, durationS) : 0;
  await audit.log(user, enc.id, "capture.started", { tokenId, bytes, finish });
  const fresh = (await encounters.get(user, enc.id))!;
  if (finish) await draft(user, fresh, o);
  return { encounterId: enc.id, status: finish ? ("processing" as const) : ("recording" as const), ...links(enc.id) };
}

function links(id: string) {
  return { statusUrl: `/api/capture/${id}`, noteUrl: `/api/capture/${id}/note`, uploadUrl: `/api/capture/${id}`, reviewUrl: `/encounters/${id}` };
}

async function reachable(auth: CaptureAuth, encId: string) {
  const enc = await encounters.get(auth.user, encId);
  const origin = enc ? await artifacts.get<CaptureOrigin>(enc.id, "capture_origin") : undefined;
  if (!enc || !origin) throw new Error("Capture not found");
  if (auth.tokenId && origin.tokenId !== auth.tokenId) throw new Error("Capture not found");
  if (auth.tokenId && enc.userId !== auth.user.id) throw new Error("Capture not found");
  return { enc, origin };
}

export async function appendCapture(auth: CaptureAuth, encId: string, input: CaptureInput) {
  return serialized(`enc:${encId}`, () => appendCaptureNow(auth, encId, input));
}

async function appendCaptureNow(auth: CaptureAuth, encId: string, input: CaptureInput) {
  const { enc } = await reachable(auth, encId);
  assertCan(auth.user, "clinical.capture");
  if (enc.status !== "recording" && enc.status !== "paused") throw new Invalid(enc.status === "signed" ? "This visit is signed" : "This visit is already being drafted");
  if (!(await consents.latest(enc.id))) throw new Forbidden("No consent is on file for this visit");
  const durationS = Number(input.opts.durationS) > 0 ? Math.round(Number(input.opts.durationS)) : null;
  const seq = seqOf(input.opts.seq);
  const origin = await artifacts.get<CaptureOrigin>(enc.id, "capture_origin");
  const duplicate = seq !== undefined && origin?.lastSeq !== undefined && seq <= origin.lastSeq;
  const bytes = input.audio && !duplicate ? await storeAudio(enc.id, input.audio, input.mime!, null) : (await audioChunks.list(enc.id)).reduce((n, c) => n + c.bytes, 0);
  if (input.audio && !duplicate && seq !== undefined && origin) await artifacts.set(enc.id, "capture_origin", { ...origin, lastSeq: seq });
  if (durationS) await encounters.update(auth.user, enc.id, { durationS });
  const finish = truthy(input.opts.finish);
  if (finish) {
    if (!bytes) throw new Invalid("Nothing was recorded yet");
    await draft(auth.user, (await encounters.get(auth.user, enc.id))!, input.opts);
  }
  return { encounterId: enc.id, status: finish ? ("processing" as const) : ("recording" as const), audioBytes: bytes, ...links(enc.id) };
}

export async function finishCapture(auth: CaptureAuth, encId: string, opts: Record<string, string> = {}) {
  return appendCapture(auth, encId, { audio: null, mime: null, opts: { ...opts, finish: "true" } });
}

export interface CaptureOptions {
  consent?: "granted";
  state?: string;
  method?: ConsentRecord["method"];
  othersPresent?: boolean;
  allPartiesConfirmed?: boolean;
  reason?: string;
  visitType?: string;
  encounterId?: string;
  patientId?: string;
  templateId?: string;
  detail?: "concise" | "standard" | "detailed";
  lang?: "en" | "es" | "multi";
  durationS?: number;
  finish?: boolean;
  channel?: string;
}

const asOpts = (o: CaptureOptions = {}) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));

function asAuth(actor: User | CaptureAuth): CaptureAuth {
  return "user" in actor ? actor : { user: actor, tokenId: null };
}

async function collect(bytes?: Buffer | Uint8Array | null, stream?: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | null) {
  if (bytes) return Buffer.from(bytes);
  if (!stream) return null;
  const parts: Buffer[] = [];
  let n = 0;
  for await (const c of stream as AsyncIterable<Uint8Array>) {
    n += c.length;
    if (n > MAX_CAPTURE_BYTES) throw new CaptureAuthError(413, "Recording is larger than 100 MB");
    parts.push(Buffer.from(c));
  }
  return Buffer.concat(parts);
}

export async function captureAudio(actor: User | CaptureAuth, input: { bytes?: Buffer | Uint8Array | null; stream?: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | null; mime?: string | null; options?: CaptureOptions }) {
  const audio = await collect(input.bytes, input.stream);
  const mime = audio ? normalizeMime(input.mime) : null;
  if (audio && !mime) throw new CaptureAuthError(415, "Send webm, m4a, mp4, wav, ogg, mp3 or aac audio");
  return startCapture(asAuth(actor), { audio, mime, opts: asOpts({ finish: !!audio, ...input.options }) });
}

export async function appendCaptureAudio(actor: User | CaptureAuth, encId: string, input: { bytes?: Buffer | Uint8Array | null; stream?: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | null; mime?: string | null; options?: CaptureOptions }) {
  const audio = await collect(input.bytes, input.stream);
  const mime = audio ? normalizeMime(input.mime) : null;
  if (audio && !mime) throw new CaptureAuthError(415, "Send webm, m4a, mp4, wav, ogg, mp3 or aac audio");
  return appendCapture(asAuth(actor), encId, { audio, mime, opts: asOpts(input.options) });
}

export async function finishCaptureFor(actor: User | CaptureAuth, encId: string, options: CaptureOptions = {}) {
  return finishCapture(asAuth(actor), encId, asOpts(options));
}

export type CaptureState = "recording" | "processing" | "ready" | "failed" | "signed";

export async function captureStatus(auth: CaptureAuth, encId: string) {
  const { enc, origin } = await reachable(auth, encId);
  const status: CaptureState = enc.status === "signed" ? "signed" : enc.status === "review" ? "ready" : enc.status === "processing" ? "processing" : origin.error ? "failed" : "recording";
  const bytes = (await audioChunks.list(enc.id)).reduce((n, c) => n + c.bytes, 0);
  return { encounterId: enc.id, status, error: status === "failed" ? origin.error ?? null : null, warnings: origin.warnings ?? [], audioBytes: bytes, createdAt: origin.createdAt, updatedAt: origin.finishedAt ?? origin.createdAt, ...links(enc.id) };
}

export async function captureNote(auth: CaptureAuth, encId: string) {
  if (auth.device) throw new Forbidden("Device keys can upload and check status. Open the note in the app to read it.");
  const s = await captureStatus(auth, encId);
  if (s.status !== "ready" && s.status !== "signed") throw new Invalid(s.status === "failed" ? `Drafting failed: ${s.error}` : "The note isn't ready yet");
  const rec = await notes.latest(encId);
  if (!rec) throw new Invalid("The note isn't ready yet");
  const coding = await artifacts.get<CodingResult>(encId, "coding");
  const summaries = await artifacts.get<Record<string, PatientSummary>>(encId, "summaries");
  const note = rec.content;
  return {
    encounterId: encId,
    status: s.status,
    text: noteToText(note),
    sections: note.sections.map((sec) => ({ key: sec.key, title: sec.title, text: sec.sentences.filter((x) => !x.pending).map((x) => x.text).join(sec.format === "paragraph" ? " " : "\n") })).filter((x) => x.text),
    codes: coding ? { em: coding.em?.code ?? null, diagnoses: coding.diagnoses.map((d) => ({ code: d.code, label: d.label })) } : null,
    patientSummary: summaries?.en ?? null,
    warnings: s.warnings,
    signUrl: `/api/encounters/${encId}/sign`,
    reviewUrl: s.reviewUrl,
  };
}

type Ctx<P> = { params: Promise<P> };

export function captureRoute<P = Record<string, never>>(handler: (req: Request, auth: CaptureAuth, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const viaToken = await captureActor(req);
      const user = viaToken?.user ?? (await currentUser().catch(() => null));
      if (!user) return fail("Sign in, or send Authorization: Bearer cs_cap_…", 401);
      return await handler(req, { user, tokenId: viaToken?.tokenId ?? null, device: viaToken?.device ?? false }, (await ctx.params) ?? ({} as P));
    } catch (err) {
      if (err instanceof CaptureAuthError) return fail(err.message, err.status);
      const message = err instanceof Error ? err.message : "Unexpected error";
      const status = err instanceof Forbidden ? 403 : err instanceof Invalid ? (/isn't ready|already being drafted|is signed/.test(message) ? 409 : 422) : /not found/i.test(message) ? 404 : /Unsupported audio|chunk too large/i.test(message) ? 415 : 500;
      if (status === 500) console.error(err);
      return fail(message, status);
    }
  };
}

