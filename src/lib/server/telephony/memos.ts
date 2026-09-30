import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { all, dataDir, now, run, uid } from "../../db";
import { sealBytes, unsealBytes } from "../../fhir/crypto";
import { audioSeconds, type MediaItem } from "../../engine/media";
import { dictationText, formatClock, holdExpiry, nextHold, splitNumbered, type MemoHoldState } from "../../engine/memo";
import { noteToText } from "../../engine/note";
import { captureAudio, captureTyped, finishCaptureFor, normalizeMime, onDrafted } from "../capture";
import { hipaaApplies, orgJurisdiction } from "../jurisdiction";
import { mintLoginLink } from "../magic";
import { actorFor, audit, encounters, notes, patients, users, type User } from "../repo";
import { deleteMedia, downloadMedia, maxMemoBytes } from "./media";
import { sendText } from "./sms";
import { sendWhatsApp, touchSession } from "./whatsapp";

export type MemoChannel = "mms" | "whatsapp";

interface HoldRow {
  id: string;
  phone: string;
  channel: MemoChannel;
  user_id: string;
  org_id: string;
  status: MemoHoldState["status"];
  mime: string;
  bytes: number;
  duration_s: number | null;
  path: string | null;
  message_sid: string | null;
  encounter_id: string | null;
  created_at: string;
  expires_at: string;
}

export function holdHours() {
  const h = Number(process.env.CHARTSIDE_MEMO_HOLD_HOURS ?? 24);
  return Number.isFinite(h) && h > 0 ? h : 24;
}

function holdDir() {
  return path.join(dataDir(), "memo-holds");
}

const clockLabel = (secs: number | null | undefined) => {
  const c = formatClock(secs);
  return c ? `${c} recording` : "recording";
};

async function discard(row: HoldRow, reason: "declined" | "expired") {
  if (row.path) rmSync(row.path, { force: true });
  await run("UPDATE memo_holds SET status = 'discarded', path = NULL, resolved_at = ? WHERE id = ? AND status = 'held'", now(), row.id);
  const actor = await actorFor(row.user_id, row.org_id).catch(() => undefined);
  await audit.log(actor ?? null, null, reason === "declined" ? "memo.consent_declined" : "memo.hold_expired", { holdId: row.id, channel: row.channel });
}

export async function purgeMemoHolds(at = new Date()) {
  const rows = await all<HoldRow>("SELECT * FROM memo_holds WHERE status = 'held' AND expires_at <= ?", at.toISOString());
  for (const r of rows) if (nextHold({ status: r.status, createdAt: r.created_at, expiresAt: r.expires_at }, { kind: "tick" }, at).status === "discarded") await discard(r, "expired");
  return rows.length;
}

export async function heldMemos(phone: string, channel?: MemoChannel) {
  return all<HoldRow>(`SELECT * FROM memo_holds WHERE phone = ? AND status = 'held' AND expires_at > ?${channel ? " AND channel = ?" : ""} ORDER BY created_at`, phone, now(), ...(channel ? [channel] : []));
}

async function holdMemo(user: User, phone: string, channel: MemoChannel, audio: Buffer, mime: string, secs: number | null, messageSid: string | null) {
  const id = uid("memo_");
  mkdirSync(holdDir(), { recursive: true, mode: 0o700 });
  const file = path.join(holdDir(), `${id}.enc`);
  writeFileSync(file, sealBytes(audio), { mode: 0o600 });
  const created = new Date();
  await run(
    "INSERT INTO memo_holds (id, phone, channel, user_id, org_id, status, mime, bytes, duration_s, path, message_sid, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'held', ?, ?, ?, ?, ?, ?, ?)",
    id, phone, channel, user.id, user.orgId, mime, audio.length, secs, file, messageSid, created.toISOString(), holdExpiry(created, holdHours()),
  );
  await audit.log(user, null, "memo.held", { holdId: id, channel, bytes: audio.length });
  return id;
}

async function memoCapture(user: User, phone: string, channel: MemoChannel, audio: Buffer, mime: string, secs: number | null, method: "text-confirmed" | "standing") {
  const r = await captureAudio(user, { bytes: audio, mime, options: { consent: "granted", method, state: user.prefs.state || "IL", durationS: secs ? Math.max(1, Math.round(secs)) : undefined, channel: channel === "mms" ? "text-memo" : "whatsapp", finish: false } });
  onDrafted(r.encounterId, (res) => notifyReady(user, phone, channel, secs, res));
  await finishCaptureFor(user, r.encounterId);
  await audit.log(user, r.encounterId, "memo.captured", { channel, method });
  return r.encounterId;
}

async function linkFor(user: User, phone: string, pathName: string) {
  return (await mintLoginLink(user.id, pathName, 30, { verifiesPhone: user.guestUntil ? phone : null })).url;
}

async function noteBodies(user: User, ids: string[]) {
  const out: string[] = [];
  for (const id of ids) {
    const rec = await notes.latest(id);
    if (!rec) continue;
    const enc = await encounters.get(user, id);
    const pat = enc?.patientId ? await patients.get(user, enc.patientId) : null;
    out.push(`${pat ? `${pat.name}\n` : ""}${noteToText(rec.content)}`.trim());
  }
  return out;
}

export async function notifyReady(user: User, phone: string, channel: MemoChannel, secs: number | null, r: { ok: true; encounterIds: string[] } | { ok: false; error: string }, source: "memo" | "text" = "memo") {
  const fresh = (await actorFor(user.id, user.orgId).catch(() => undefined)) ?? user;
  const what = source === "text" ? "text" : `${clockLabel(secs)}`;
  if (fresh.prefs.textOptOut && channel === "mms") {
    await audit.log(fresh, null, "memo.text_skipped", { reason: "opted_out" });
    return;
  }
  const send = async (body: string, content = false) => {
    if (channel === "whatsapp") {
      const s = await sendWhatsApp(phone, body);
      if (s.skipped) await audit.log(fresh, null, "whatsapp.skipped", { reason: s.skipped });
      return;
    }
    for (const part of content ? splitNumbered(body, 1600) : [body]) await sendText(phone, part, "memo_note", { content });
  };
  try {
    if (!r.ok) {
      await send(`Chartside: we couldn't finish the note from your ${what}. Open Chartside to retry: ${await linkFor(fresh, phone, "/go")}`);
      return;
    }
    const ids = r.encounterIds;
    const link = await linkFor(fresh, phone, ids.length === 1 ? `/go/stack?focus=${ids[0]}` : "/go/stack");
    const many = ids.length > 1 ? `${ids.length} notes` : "note";
    const verb = ids.length > 1 ? "are" : "is";
    const head = fresh.guestUntil ? `Chartside: your ${many} from the ${what} ${verb} ready. Tap to save ${ids.length > 1 ? "them" : "it"} (free): ${link}` : `Chartside: your ${many} from the ${what} ${verb} ready. Review and sign: ${link}`;
    const inline = channel === "whatsapp" || !hipaaApplies(await orgJurisdiction(fresh.orgId));
    if (inline && !fresh.guestUntil) {
      const bodies = await noteBodies(fresh, ids);
      await send(`${bodies.join("\n\n---\n\n")}\n\nEdit and sign: ${link}`, true);
    } else await send(head);
    await audit.log(fresh, ids[0] ?? null, "memo.texted", { channel, notes: ids.length, inline: inline && !fresh.guestUntil });
  } catch (err) {
    console.error("memo text failed", err instanceof Error ? err.message : err);
    await audit.log(fresh, null, "memo.text_failed", { channel });
  }
}

export async function uploadLinkReply(user: User | null, origin: string, phone: string) {
  if (!user || user.guestUntil) return `Too big to text? Record or upload it here: ${origin}/go`;
  return `Too big to text? Upload it here. The link works once, for 30 minutes: ${await linkFor(user, phone, "/go/upload")}`;
}

export async function inboundMemo(input: { user: User; phone: string; channel: MemoChannel; items: MediaItem[]; messageSid?: string | null; origin: string }) {
  const { user, phone, channel, items, origin } = input;
  await purgeMemoHolds();
  if (channel === "whatsapp") await touchSession(phone, channel);
  const audio = items.filter((i) => i.audio);
  for (const i of items.filter((x) => !x.audio)) {
    const deleted = await deleteMedia(i.url);
    await audit.log(user, null, "memo.media_deleted", { channel, deleted, unread: true, type: i.contentType.split("/")[0] });
  }
  if (!audio.length) return "I can only take voice recordings. Text a voice memo, or call this number to record a visit.";
  const standing = !user.guestUntil && !!user.prefs.memoStandingConsent;
  let tooBig = false;
  let failed = 0;
  const kept: number[] = [];
  let held = 0;
  for (const item of audio) {
    const dl = await downloadMedia(item);
    const deleted = await deleteMedia(item.url);
    await audit.log(user, null, "memo.media_deleted", { channel, deleted, unread: !dl.ok });
    if (!dl.ok) {
      if (dl.reason === "too_big") tooBig = true;
      else failed++;
      continue;
    }
    const mime = normalizeMime(item.contentType) ?? normalizeMime(dl.contentType);
    if (!mime) {
      failed++;
      continue;
    }
    const secs = audioSeconds(dl.buffer, mime);
    kept.push(secs ?? 0);
    if (standing) await memoCapture(user, phone, channel, dl.buffer, mime, secs, "standing");
    else {
      await holdMemo(user, phone, channel, dl.buffer, mime, secs, input.messageSid ?? null);
      held++;
    }
  }
  if (!kept.length) {
    if (tooBig) return `That recording is over ${Math.round(maxMemoBytes() / 1048576)} MB. ${await uploadLinkReply(user, origin, phone)}`;
    return "I couldn't open that recording. Try sending it again, or call this number instead.";
  }
  const total = kept.reduce((a, b) => a + b, 0);
  const label = clockLabel(total || null);
  const extra = tooBig ? ` One file was too big to text. ${await uploadLinkReply(user, origin, phone)}` : "";
  if (!held) return `Got your ${label}. Writing the note.${extra}`;
  const vet = (await orgJurisdiction(user.orgId)) === "veterinary";
  return `Got your ${label}. Reply YES if your ${vet ? "client" : "patient"} agreed to be recorded, or NO to delete it. Nothing is written until you reply, and it is deleted after ${holdHours()} hours.${extra}`;
}

export async function resolveHolds(phone: string, intent: "yes" | "no" | "always", channel?: MemoChannel) {
  const rows = await heldMemos(phone, channel);
  if (!rows.length) return null;
  const user = await actorFor(rows[0].user_id, rows[0].org_id);
  if (!user) return null;
  if (intent === "no") {
    for (const r of rows) await discard(r, "declined");
    return `Deleted. Nothing from ${rows.length > 1 ? "those recordings" : "that recording"} was kept.`;
  }
  let standingSet = false;
  if (intent === "always") {
    if (user.guestUntil) return "Save your account first, then you can turn on standing consent. Reply YES to confirm this recording.";
    await users.update(user.id, { prefs: { ...user.prefs, memoStandingConsent: now() } });
    await audit.log(user, null, "memo.standing_consent", { on: true });
    standingSet = true;
  }
  let secs = 0;
  for (const r of rows) {
    const claimed = await run("UPDATE memo_holds SET status = 'confirmed', resolved_at = ? WHERE id = ? AND status = 'held'", now(), r.id);
    if (!claimed.changes || !r.path) continue;
    let audio: Buffer;
    try {
      audio = unsealBytes(readFileSync(r.path));
    } catch {
      continue;
    } finally {
      rmSync(r.path, { force: true });
    }
    const encId = await memoCapture(user, phone, r.channel, audio, r.mime, r.duration_s, standingSet ? "standing" : "text-confirmed");
    await run("UPDATE memo_holds SET encounter_id = ?, path = NULL WHERE id = ?", encId, r.id);
    secs += r.duration_s ?? 0;
  }
  const label = clockLabel(secs || null);
  if (standingSet) return `Got it. You won't be asked again. Writing the note from your ${label} now.`;
  const offer = !user.guestUntil ? " If you always get consent in the room, reply ALWAYS and I won't ask again." : "";
  return `Thanks. Writing the note from your ${label}. I'll text you when it's ready.${offer}`;
}

export async function dictateByText(user: User, phone: string, channel: MemoChannel, raw: string) {
  const text = dictationText(raw);
  await captureTyped(user, text, { channel: channel === "mms" ? "text-note" : "whatsapp", onDrafted: (res) => notifyReady(user, phone, channel, null, res, "text") });
  return "Got it. Writing the note from your text. I'll send you a link when it's ready.";
}
