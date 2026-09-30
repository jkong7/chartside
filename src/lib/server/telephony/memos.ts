import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { all, dataDir, now, run, uid } from "../../db";
import { sealBytes, unsealBytes } from "../../fhir/crypto";
import { audioSeconds, type MediaItem } from "../../engine/media";
import { dictationText, formatClock, holdExpiry, nextHold, splitNumbered, type MemoHoldState } from "../../engine/memo";
import { noteToText } from "../../engine/note";
import { captureAudio, captureTyped, finishCaptureFor, normalizeMime, onDrafted } from "../capture";
import { hipaaApplies, orgJurisdiction, textOptedOut } from "../jurisdiction";
import { mintUploadToken } from "../captureTokens";
import { mintLoginLink, publicOrigin } from "../magic";
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

const DISCARD_ACTION = { declined: "memo.consent_declined", expired: "memo.hold_expired", orphaned: "memo.hold_orphaned" } as const;

async function discard(row: HoldRow, reason: keyof typeof DISCARD_ACTION) {
  if (row.path) rmSync(row.path, { force: true });
  await run("UPDATE memo_holds SET status = 'discarded', path = NULL, resolved_at = ? WHERE id = ? AND status = 'held'", now(), row.id);
  const actor = reason === "orphaned" ? undefined : await actorFor(row.user_id, row.org_id).catch(() => undefined);
  await audit.log(actor ?? null, null, DISCARD_ACTION[reason], { holdId: row.id, channel: row.channel });
}

export async function firstSeen(messageSid: string | null | undefined) {
  if (!messageSid) return true;
  const { changes } = await run("INSERT INTO inbound_messages (sid, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING", messageSid.slice(0, 64), now());
  return changes > 0;
}

export async function purgeMemoHolds(at = new Date()) {
  const rows = await all<HoldRow>("SELECT * FROM memo_holds WHERE status = 'held' AND expires_at <= ?", at.toISOString());
  for (const r of rows) if (nextHold({ status: r.status, createdAt: r.created_at, expiresAt: r.expires_at }, { kind: "tick" }, at).status === "discarded") await discard(r, "expired");
  await run("DELETE FROM inbound_messages WHERE created_at < ?", new Date(at.getTime() - 7 * 86400_000).toISOString());
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
    id, phone, channel, user.id, user.orgId, mime, audio.length, secs, file, messageSid, created.toISOString(), user.guestUntil && user.guestUntil < holdExpiry(created, holdHours()) ? user.guestUntil : holdExpiry(created, holdHours()),
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
  if (channel === "mms" && (fresh.prefs.textOptOut || (await textOptedOut(phone)))) {
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
    const owners = ids.length ? await all<{ org_id: string }>(`SELECT DISTINCT org_id FROM encounters WHERE id IN (${ids.map(() => "?").join(", ")})`, ...ids) : [];
    if (owners.length !== 1 || owners[0].org_id !== fresh.orgId) {
      await audit.log(fresh, null, "memo.text_skipped", { reason: "org_mismatch", channel });
      return;
    }
    const link = await linkFor(fresh, phone, ids.length === 1 ? `/go/stack?focus=${ids[0]}` : "/go/stack");
    const many = ids.length > 1 ? `${ids.length} notes` : "note";
    const verb = ids.length > 1 ? "are" : "is";
    const head = fresh.guestUntil ? `Chartside: your ${many} from the ${what} ${verb} ready. Tap to save ${ids.length > 1 ? "them" : "it"} (free): ${link}` : `Chartside: your ${many} from the ${what} ${verb} ready. Review and sign: ${link}`;
    const inline = !hipaaApplies(await orgJurisdiction(owners[0].org_id));
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
  const { token } = await mintUploadToken(user, 30);
  const client = (await orgJurisdiction(user.orgId)) === "veterinary" ? "client" : "patient";
  return `Too big to text? Upload it here. The link works once, for 30 minutes: ${publicOrigin(origin)}/go/upload#t=${token}&c=${client}`;
}

export async function inboundMemo(input: { user: User; phone: string; channel: MemoChannel; items: MediaItem[]; messageSid?: string | null; origin: string }) {
  const { user, phone, channel, items, origin } = input;
  if (!(await firstSeen(input.messageSid))) return "";
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
  const hrs = user.guestUntil ? Math.max(1, Math.round((Date.parse(user.guestUntil) - Date.now()) / 3600_000)) : holdHours();
  return `Got your ${label}. Reply YES if your ${vet ? "client" : "patient"} agreed to be recorded, or NO to delete it. Nothing is written until you reply, and it is deleted after ${hrs} hour${hrs === 1 ? "" : "s"}.${extra}`;
}

export async function resolveHolds(phone: string, intent: "yes" | "no" | "always", channel?: MemoChannel, messageSid?: string | null) {
  if (!(await firstSeen(messageSid))) return "";
  const rows = await heldMemos(phone, channel);
  if (!rows.length) return null;
  const groups = new Map<string, HoldRow[]>();
  for (const r of rows) groups.set(`${r.user_id}:${r.org_id}`, [...(groups.get(`${r.user_id}:${r.org_id}`) ?? []), r]);
  const live: { user: User; rows: HoldRow[] }[] = [];
  for (const g of groups.values()) {
    const user = await actorFor(g[0].user_id, g[0].org_id).catch(() => undefined);
    if (!user || user.orgId !== g[0].org_id) {
      for (const r of g) await discard(r, "orphaned");
      continue;
    }
    live.push({ user, rows: g });
  }
  if (!live.length) return null;
  const count = live.reduce((n, g) => n + g.rows.length, 0);
  if (intent === "no") {
    for (const g of live) for (const r of g.rows) await discard(r, "declined");
    return `Deleted. Nothing from ${count > 1 ? "those recordings" : "that recording"} was kept.`;
  }
  let standingSet = false;
  let guestAsked = false;
  let secs = 0;
  for (const { user, rows: held } of live) {
    if (intent === "always") {
      if (user.guestUntil) {
        guestAsked = true;
        continue;
      }
      await users.update(user.id, { prefs: { ...user.prefs, memoStandingConsent: now() } });
      await audit.log(user, null, "memo.standing_consent", { on: true });
      standingSet = true;
    }
    for (const r of held) {
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
      const encId = await memoCapture(user, phone, r.channel, audio, r.mime, r.duration_s, intent === "always" ? "standing" : "text-confirmed");
      await run("UPDATE memo_holds SET encounter_id = ?, path = NULL WHERE id = ?", encId, r.id);
      secs += r.duration_s ?? 0;
    }
  }
  if (guestAsked && !standingSet) return "Save your account first, then you can turn on standing consent. Reply YES to confirm this recording.";
  const label = clockLabel(secs || null);
  if (standingSet) return `Got it. You won't be asked again. Writing the note from your ${label} now.`;
  const offer = live.some((g) => !g.user.guestUntil) ? " If you always get consent in the room, reply ALWAYS and I won't ask again." : "";
  return `Thanks. Writing the note from your ${label}. I'll text you when it's ready.${offer}`;
}

export async function dictateByText(user: User, phone: string, channel: MemoChannel, raw: string) {
  const text = dictationText(raw);
  await captureTyped(user, text, { channel: channel === "mms" ? "text-note" : "whatsapp", onDrafted: (res) => notifyReady(user, phone, channel, null, res, "text") });
  return "Got it. Writing the note from your text. I'll send you a link when it's ready.";
}
