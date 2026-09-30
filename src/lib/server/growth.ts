import { nameFromEmail } from "./guest";
import { createHash, randomBytes } from "node:crypto";
import { all, get, now, run, uid } from "../db";
import { Invalid } from "./policy";
import { publicOrigin } from "./magic";
import { checkActivation } from "./loops";
import { audit, users, type User } from "./repo";

export const CREDIT_MONTHS = 1;
export const CREDIT_CAP_MONTHS = 12;
export const MINUTES_SAVED_PER_NOTE = 12;
export const INVITE_AFTER_SIGNED = 3;
export const REF_COOKIE = "cs_ref";

export interface NpiRecord {
  number: string;
  first: string;
  last: string;
  credential: string;
  specialty: string;
  state: string;
  taxonomyCode?: string;
}

export function npiValid(npi: string) {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = `80840${npi.slice(0, 9)}`.split("").map(Number);
  let sum = 0;
  for (let i = digits.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) {
    let d = digits[i];
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(npi[9]);
}

function nppesBase() {
  return (process.env.NPPES_BASE_URL || "https://npiregistry.cms.hhs.gov").replace(/\/$/, "");
}

export async function lookupNpi(npi: string): Promise<NpiRecord | null> {
  const n = String(npi ?? "").replace(/\D/g, "");
  if (!npiValid(n)) throw new Invalid("That isn't a valid 10-digit NPI");
  const res = await fetch(`${nppesBase()}/api/?version=2.1&number=${n}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Invalid("The NPI registry didn't answer. Try again in a minute.");
  const j = (await res.json()) as { result_count?: number; results?: { number: string | number; enumeration_type?: string; basic?: { first_name?: string; last_name?: string; credential?: string }; taxonomies?: { code?: string; desc?: string; primary?: boolean; state?: string }[]; addresses?: { address_purpose?: string; state?: string }[] }[] };
  const r = j.results?.[0];
  if (!r || r.enumeration_type === "NPI-2") return null;
  const tax = r.taxonomies?.find((t) => t.primary) ?? r.taxonomies?.[0];
  const addr = r.addresses?.find((a) => a.address_purpose === "LOCATION") ?? r.addresses?.[0];
  const cap = (s = "") => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return { number: String(r.number), first: cap(r.basic?.first_name), last: cap(r.basic?.last_name), credential: (r.basic?.credential ?? "").replace(/\./g, ""), specialty: tax?.desc ?? "", state: addr?.state ?? tax?.state ?? "", taxonomyCode: tax?.code ?? undefined };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

export async function claimNpi(u: User, input: { npi?: string; state?: string; applyName?: boolean }) {
  const rec = await lookupNpi(input.npi ?? "");
  if (!rec) throw new Invalid("No individual clinician has that NPI");
  const taken = await get<{ id: string }>("SELECT id FROM users WHERE id <> ? AND prefs LIKE ?", u.id, `%"number":"${rec.number}",%"matched":true%`);
  const nameMatch = u.name.split(/\s+/).map(norm).filter(Boolean).includes(norm(rec.last));
  const placeholder = u.name === "Guest clinician" || u.name === "Clinician" || u.name === nameFromEmail(u.email);
  const adopt = !!input.applyName && !u.hasPassword && placeholder && !!input.state;
  const stateMatch = adopt ? input.state!.toUpperCase() === rec.state : !input.state || input.state.toUpperCase() === rec.state;
  const reason = taken ? "This NPI is already on another Chartside account" : !stateMatch ? `The registry lists ${rec.state}, not ${input.state!.toUpperCase()}` : !nameMatch && !adopt ? `The registry name is ${rec.first} ${rec.last}` : null;
  const matched = !reason;
  const name = matched && adopt ? `${rec.first} ${rec.last}` : u.name;
  const npi = { number: rec.number, name: `${rec.first} ${rec.last}${rec.credential ? `, ${rec.credential}` : ""}`, credential: rec.credential, specialty: rec.specialty, state: rec.state, matched, reason, at: now() };
  await users.update(u.id, { name, specialty: matched && rec.specialty ? rec.specialty : u.specialty, prefs: { npi } });
  await audit.log(u, null, "growth.npi_claimed", { matched, reason: reason ? reason.replace(/\d{10}/g, "") : null });
  return { ...npi, badge: matched ? "NPI on file (self-attested, matched to the public registry)" : null };
}

export async function referralCode(u: Pick<User, "id">) {
  const r = await get<{ code: string }>("SELECT code FROM referral_codes WHERE user_id = ?", u.id);
  if (r) return r.code;
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(5).toString("base64url").replace(/[-_]/g, "").slice(0, 6).toLowerCase();
    if (code.length < 6) continue;
    const { changes } = await run("INSERT INTO referral_codes (code, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", code, u.id, now());
    if (changes) return code;
    const again = await get<{ code: string }>("SELECT code FROM referral_codes WHERE user_id = ?", u.id);
    if (again) return again.code;
  }
  throw new Error("Could not create a referral code");
}

export function referralUrl(code: string, origin?: string) {
  return `${publicOrigin(origin)}/r/${code}`;
}

export async function referrerFor(code: string | null | undefined) {
  if (!code || !/^[a-z0-9]{6}$/.test(code)) return null;
  return (await get<{ user_id: string }>("SELECT user_id FROM referral_codes WHERE code = ?", code))?.user_id ?? null;
}

export async function attributeReferral(userId: string, code: string | null | undefined) {
  const referrer = await referrerFor(code);
  if (!referrer || referrer === userId) return false;
  const { changes } = await run("UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL AND guest_expires_at IS NULL", referrer, userId);
  if (changes) await audit.log({ id: userId, orgId: null }, null, "growth.referred", { referrer });
  return !!changes;
}

async function signedCount(userId: string) {
  return Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM encounters WHERE user_id = ? AND status = 'signed'", userId))?.n ?? 0);
}

export async function creditsFor(userId: string) {
  const rows = await all<{ kind: string; months: number }>("SELECT kind, months FROM growth_credits WHERE user_id = ?", userId);
  const months = rows.reduce((n, r) => n + Number(r.months), 0);
  const given = rows.filter((r) => r.kind === "referrer").reduce((n, r) => n + Number(r.months), 0);
  return { months, fromReferrals: given, cap: CREDIT_CAP_MONTHS, capped: given >= CREDIT_CAP_MONTHS };
}

export async function onSigned(u: User) {
  const r = await get<{ referred_by: string | null; guest_expires_at: string | null }>("SELECT referred_by, guest_expires_at FROM users WHERE id = ?", u.id);
  if (!r?.referred_by || r.guest_expires_at || (await signedCount(u.id)) < 1) {
    await checkActivation(u.id);
    return null;
  }
  const { changes } = await run("INSERT INTO growth_credits (id, user_id, kind, months, other_user_id, created_at) VALUES (?, ?, 'referred', ?, ?, ?) ON CONFLICT DO NOTHING", uid("crd_"), u.id, CREDIT_MONTHS, r.referred_by, now());
  if (!changes) return null;
  await checkActivation(u.id);
  const referrer = await creditsFor(r.referred_by);
  const referrerCredited = !referrer.capped;
  if (referrerCredited) await run("INSERT INTO growth_credits (id, user_id, kind, months, other_user_id, created_at) VALUES (?, ?, 'referrer', ?, ?, ?) ON CONFLICT DO NOTHING", uid("crd_"), r.referred_by, CREDIT_MONTHS, u.id, now());
  await audit.log(u, null, "growth.credits", { referrer: r.referred_by, referrerCredited, months: CREDIT_MONTHS });
  return { you: CREDIT_MONTHS, referrer: referrerCredited ? CREDIT_MONTHS : 0 };
}

export interface ReceiptStats {
  clinician: string;
  specialty: string;
  weekOf: string;
  notesSigned: number;
  closedSameDay: number;
  afterHours: number;
  hoursBack: number;
  medianMinutesToSign: number | null;
  line: string;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function displayName(name: string, credential?: string) {
  const clean = name.replace(/^dr\.?\s+/i, "").trim();
  const last = clean.split(/\s+/).pop() ?? clean;
  return /\b(MD|DO)\b/.test(credential ?? "") || /^dr\.?\s/i.test(name) ? `Dr. ${last}` : clean;
}

export async function receiptStats(u: User, at = new Date()): Promise<ReceiptStats> {
  const from = new Date(at.getTime() - 7 * 86400000).toISOString();
  const rows = await all<{ ended_at: string | null; started_at: string | null; scheduled_at: string; signed_at: string }>("SELECT ended_at, started_at, scheduled_at, signed_at FROM encounters WHERE user_id = ? AND status = 'signed' AND signed_at >= ? AND signed_at <= ?", u.id, from, at.toISOString());
  let sameDay = 0;
  let afterHours = 0;
  const lags: number[] = [];
  for (const r of rows) {
    const end = new Date(r.ended_at ?? r.started_at ?? r.scheduled_at);
    const signed = new Date(r.signed_at);
    const hour = signed.getHours();
    const weekend = signed.getDay() === 0 || signed.getDay() === 6;
    if (hour >= 19 || hour < 6 || weekend) afterHours++;
    else if (signed.toDateString() === end.toDateString()) sameDay++;
    lags.push(Math.max(0, Math.round((signed.getTime() - end.getTime()) / 60000)));
  }
  const npi = u.prefs.npi?.matched ? u.prefs.npi : null;
  return {
    clinician: displayName(u.name, npi?.credential ?? u.credential),
    specialty: npi?.specialty || u.specialty,
    weekOf: from.slice(0, 10),
    notesSigned: rows.length,
    closedSameDay: sameDay,
    afterHours,
    hoursBack: Math.round((rows.length * MINUTES_SAVED_PER_NOTE) / 6) / 10,
    medianMinutesToSign: median(lags),
    line: `${new URL(publicOrigin()).host}/line`,
  };
}

export async function createReceipt(u: User) {
  const stats = await receiptStats(u);
  const token = randomBytes(12).toString("base64url");
  await run("INSERT INTO receipts (token, user_id, content, created_at) VALUES (?, ?, ?, ?)", token, u.id, JSON.stringify(stats), now());
  await audit.log(u, null, "growth.receipt_created", { notes: stats.notesSigned });
  return { token, url: `${publicOrigin()}/receipt/${token}`, stats };
}

export async function receiptOwner(token: string) {
  return (await get<{ user_id: string }>("SELECT user_id FROM receipts WHERE token = ? AND revoked_at IS NULL", token))?.user_id ?? null;
}

export async function receiptByToken(token: string): Promise<ReceiptStats | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const r = await get<{ content: string; revoked_at: string | null }>("SELECT content, revoked_at FROM receipts WHERE token = ?", token);
  return r && !r.revoked_at ? (JSON.parse(r.content) as ReceiptStats) : null;
}

export async function revokeReceipt(u: User, token: string) {
  const { changes } = await run("UPDATE receipts SET revoked_at = ? WHERE token = ? AND user_id = ? AND revoked_at IS NULL", now(), token, u.id);
  if (!changes) throw new Error("Receipt not found");
}

export async function writtenInSeconds(encId: string) {
  const r = await get<{ ended_at: string | null; first_note: string | null }>("SELECT e.ended_at, (SELECT MIN(created_at) FROM notes n WHERE n.encounter_id = e.id) AS first_note FROM encounters e WHERE e.id = ?", encId);
  if (!r?.ended_at || !r.first_note) return null;
  const s = Math.round((new Date(r.first_note).getTime() - new Date(r.ended_at).getTime()) / 1000);
  return s > 0 && s < 3600 ? s : null;
}

export async function shareFooter(encId: string, clinicianId: string) {
  const seconds = await writtenInSeconds(encId);
  const code = await referralCode({ id: clinicianId });
  return { written: seconds ? `Written with Chartside in ${seconds < 90 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`}` : "Written with Chartside", tryUrl: `/r/${code}?src=share`, demoUrl: "/line" };
}

export async function shareFooterForToken(token: string) {
  const r = await get<{ encounter_id: string; created_by: string }>("SELECT encounter_id, created_by FROM encounter_shares WHERE token_hash = ?", createHash("sha256").update(token).digest("hex"));
  return r ? { ...(await shareFooter(r.encounter_id, r.created_by)), inviterId: r.created_by } : null;
}

export function inviteMessage(u: User, url: string) {
  return `I've been writing my notes with Chartside. You call a number before the visit, and the note is ready when you hang up. Here's a free month for both of us: ${url}`;
}

export async function growthState(u: User, origin?: string) {
  const code = await referralCode(u);
  const url = `${referralUrl(code, origin)}?src=invite`;
  const signed = await signedCount(u.id);
  return {
    referral: { code, url, message: inviteMessage(u, url) },
    credits: await creditsFor(u.id),
    npi: u.prefs.npi ?? null,
    signed,
    prompts: { invite: !u.guestUntil && signed >= INVITE_AFTER_SIGNED && !u.prefs.invitePromptSeenAt },
  };
}

export async function markPromptSeen(u: User, prompt: string) {
  if (prompt !== "invite") throw new Invalid("Unknown prompt");
  await users.update(u.id, { prefs: { invitePromptSeenAt: now() } });
  await audit.log(u, null, "growth.prompt_seen", { prompt });
}
