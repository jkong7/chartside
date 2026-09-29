import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { get, now, run, uid } from "../db";
import { hashPassword, verifyPassword } from "./auth";
import { deliver } from "./delivery";
import { convertGuest, GUEST_EMAIL_DOMAIN, mergeGuest, nameFromEmail } from "./guest";
import { normalizePhone } from "./notify";
import { Forbidden, Invalid } from "./policy";
import { actorFor, audit, orgs, users, type User } from "./repo";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const newCode = () => String(randomInt(0, 1000000)).padStart(6, "0");
const newToken = () => randomBytes(24).toString("base64url");

export class SsoRequired extends Error {
  constructor(public orgName: string) {
    super(`${orgName} requires single sign-on. Continue with SSO.`);
  }
}

interface LinkRow {
  id: string;
  kind: "email" | "login" | "phone";
  user_id: string | null;
  email: string | null;
  phone: string | null;
  guest_user_id: string | null;
  code_hash: string | null;
  attempts: number;
  next_path: string | null;
  expires_at: string;
  used_at: string | null;
}

export function safePath(p: string | null | undefined, fallback = "/today") {
  if (!p || typeof p !== "string") return fallback;
  if (!p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\") || /[\r\n]/.test(p)) return fallback;
  try {
    const u = new URL(p, "http://x.invalid");
    return u.origin === "http://x.invalid" ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function publicOrigin(fallback?: string) {
  return (process.env.CHARTSIDE_PUBLIC_URL || fallback || "http://localhost:3100").replace(/\/$/, "");
}

const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1•••$2");
const maskPhone = (p: string) => p.replace(/\d(?=\d{4})/g, "•");

async function throttle(column: "email" | "phone", value: string, kind: string) {
  const recent = await get<{ n: number; last: string | null }>(`SELECT COUNT(*) AS n, MAX(created_at) AS last FROM magic_links WHERE ${column} = ? AND kind = ? AND created_at > ?`, value, kind, new Date(Date.now() - 3600000).toISOString());
  if (recent?.last && Date.now() - new Date(recent.last).getTime() < 30000) throw new Invalid("A code was just sent. Wait 30 seconds before asking again.");
  if (Number(recent?.n ?? 0) >= 6) throw new Invalid("Too many codes requested. Try again in an hour.");
}

export async function requestEmailSignIn(emailIn: string, opts: { next?: string | null; origin?: string; guestUserId?: string | null } = {}) {
  const email = (emailIn ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)) throw new Invalid("Enter a valid email address");
  const sso = await orgs.requiringSso(email.split("@")[1]);
  if (sso) throw new SsoRequired(sso.name);
  await throttle("email", email, "email");
  const id = uid("mag_");
  const code = newCode();
  const token = newToken();
  const next = safePath(opts.next);
  await run("INSERT INTO magic_links (id, kind, email, guest_user_id, token_hash, code_hash, next_path, expires_at, created_at) VALUES (?, 'email', ?, ?, ?, ?, ?, ?, ?)", id, email, opts.guestUserId ?? null, sha(token), sha(`${id}:${code}`), next, new Date(Date.now() + CODE_TTL_MS).toISOString(), now());
  const url = `${publicOrigin(opts.origin)}/m/${token}`;
  const sent = await deliver({ channel: "email", to: email, kind: "magic_code", subject: `${code} is your Chartside sign-in code`, body: `Your Chartside sign-in code is ${code}.\n\nOr open this link on the device you're signing in on:\n${url}\n\nThe code and link expire in 10 minutes and work once. If you didn't ask for this, ignore this email.` });
  await audit.log(null, null, "magic.sent", { id, channel: "email", status: sent.status, transport: sent.transport, claim: !!opts.guestUserId });
  if (sent.status !== "sent") throw new Invalid("We couldn't send the email. Try again in a minute.");
  return { email: mask(email), expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString() };
}

export async function mintLoginLink(userId: string, path: string, ttlMin = 15, opts: { origin?: string; verifiesPhone?: string | null } = {}) {
  if (!(await users.byId(userId))) throw new Error("User not found");
  const minutes = Math.min(Math.max(Math.round(ttlMin), 1), 24 * 60);
  const token = newToken();
  const id = uid("mag_");
  const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
  const phone = opts.verifiesPhone ? normalizePhone(opts.verifiesPhone) : null;
  await run("INSERT INTO magic_links (id, kind, user_id, phone, token_hash, next_path, expires_at, created_at) VALUES (?, 'login', ?, ?, ?, ?, ?, ?)", id, userId, phone, sha(token), safePath(path), expiresAt, now());
  await audit.log({ id: userId, orgId: null }, null, "magic.login_link", { id, minutes, verifiesPhone: !!phone });
  return { url: `${publicOrigin(opts.origin)}/m/${token}`, token, expiresAt };
}

export async function linkInfo(token: string) {
  const r = await get<LinkRow>("SELECT * FROM magic_links WHERE token_hash = ?", sha(token));
  if (!r || r.kind === "phone") return null;
  return { valid: !r.used_at && r.expires_at > now(), kind: r.kind, email: r.email ? mask(r.email) : null, next: r.next_path ?? "/today" };
}

async function consume(r: LinkRow) {
  const { changes } = await run("UPDATE magic_links SET used_at = ?, code_hash = NULL WHERE id = ? AND used_at IS NULL", now(), r.id);
  if (!changes) throw new Invalid("This link was already used. Ask for a new one.");
}

async function checkCode(r: LinkRow | undefined, code: string) {
  if (!r || r.used_at || !r.code_hash || r.expires_at < now()) throw new Invalid("That code expired. Ask for a new one.");
  if (r.attempts >= MAX_ATTEMPTS) throw new Invalid("Too many tries. Ask for a new code.");
  const a = Buffer.from(sha(`${r.id}:${String(code ?? "").trim()}`));
  const b = Buffer.from(r.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await run("UPDATE magic_links SET attempts = attempts + 1 WHERE id = ?", r.id);
    throw new Invalid(r.attempts + 1 >= MAX_ATTEMPTS ? "Too many tries. Ask for a new code." : "That code isn't right");
  }
}

export interface Redeemed {
  user: User;
  next: string;
  created: boolean;
  claimed: number | null;
}

export async function redeemMagic(input: { token?: string; email?: string; code?: string }, current: User | null): Promise<Redeemed> {
  let r: LinkRow | undefined;
  if (input.token) {
    r = await get<LinkRow>("SELECT * FROM magic_links WHERE token_hash = ?", sha(input.token));
    if (!r || r.kind === "phone") throw new Invalid("This link isn't valid");
    if (r.used_at) throw new Invalid("This link was already used. Ask for a new one.");
    if (r.expires_at < now()) throw new Invalid("This link expired. Ask for a new one.");
  } else {
    const email = (input.email ?? "").trim().toLowerCase();
    r = await get<LinkRow>("SELECT * FROM magic_links WHERE email = ? AND kind = 'email' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1", email);
    await checkCode(r, input.code ?? "");
  }
  await consume(r!);
  const row = r!;
  let userId: string;
  let created = false;
  let claimed: number | null = null;
  if (row.kind === "login") {
    userId = row.user_id!;
    if (row.phone) await markPhoneVerified(userId, row.phone);
  } else {
    const email = row.email!;
    const guestId = row.guest_user_id ?? (current?.guestUntil ? current.id : null);
    const existing = await users.byEmail(email);
    if (existing) {
      userId = existing.id;
      if (guestId && guestId !== existing.id) claimed = await mergeGuest(guestId, existing.id);
    } else if (guestId && (await get<{ id: string }>("SELECT id FROM users WHERE id = ? AND guest_expires_at IS NOT NULL", guestId))) {
      userId = await convertGuest(guestId, email);
      created = true;
      claimed = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM encounters WHERE user_id = ?", guestId))?.n ?? 0);
    } else {
      const base = await users.create({ email, name: nameFromEmail(email), passwordHash: "", specialty: "Family Medicine" });
      await orgs.create(`${base.name}'s practice`, base.id);
      userId = base.id;
      created = true;
    }
  }
  const user = await actorFor(userId);
  if (!user) throw new Forbidden("Your access to Chartside has been disabled. Contact your administrator.");
  await audit.log(user, null, created ? "user.registered" : "magic.redeemed", { id: row.id, kind: row.kind, via: input.token ? "link" : "code", claimed });
  return { user, next: row.next_path ?? "/today", created, claimed };
}

async function markPhoneVerified(userId: string, phone: string) {
  const taken = await get<{ id: string }>("SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL AND id <> ?", phone, userId);
  if (taken) return false;
  await run("UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?", phone, now(), userId);
  return true;
}

export async function requestPhoneVerification(u: User, phoneIn: string) {
  const phone = normalizePhone(phoneIn ?? "");
  if (!phone) throw new Invalid("Enter a mobile number with area code");
  const taken = await get<{ id: string }>("SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL AND id <> ?", phone, u.id);
  if (taken) throw new Invalid("That number is already verified on another Chartside account");
  await throttle("phone", phone, "phone");
  const id = uid("mag_");
  const code = newCode();
  await run("INSERT INTO magic_links (id, kind, user_id, phone, token_hash, code_hash, expires_at, created_at) VALUES (?, 'phone', ?, ?, ?, ?, ?, ?)", id, u.id, phone, sha(newToken()), sha(`${id}:${code}`), new Date(Date.now() + CODE_TTL_MS).toISOString(), now());
  const sent = await deliver({ channel: "sms", to: phone, kind: "phone_code", body: `Your Chartside code is ${code}. It expires in 10 minutes.` });
  await audit.log(u, null, "phone.code_sent", { id, status: sent.status, transport: sent.transport });
  if (sent.status !== "sent") throw new Invalid("We couldn't text that number. Check it and try again.");
  return { phone: maskPhone(phone) };
}

export async function confirmPhoneVerification(u: User, code: string) {
  const r = await get<LinkRow>("SELECT * FROM magic_links WHERE user_id = ? AND kind = 'phone' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1", u.id);
  await checkCode(r, code);
  await consume(r!);
  if (!(await markPhoneVerified(u.id, r!.phone!))) throw new Invalid("That number is already verified on another Chartside account");
  await audit.log(u, null, "phone.verified", {});
  return { phone: maskPhone(r!.phone!) };
}

export async function verifyPhone(userId: string, e164: string) {
  const phone = normalizePhone(e164);
  if (!phone) throw new Invalid("Invalid phone number");
  if (!(await markPhoneVerified(userId, phone))) throw new Invalid("That number is already verified on another Chartside account");
  return phone;
}

const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 30 * 60 * 1000;

export function pinProblem(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) return "Use 4 to 6 digits";
  if (/^(\d)\1+$/.test(pin)) return "Avoid a PIN that repeats one digit";
  const up = "0123456789012345";
  const down = "9876543210987654";
  if (up.includes(pin) || down.includes(pin)) return "Avoid a PIN with digits in a row";
  return null;
}

export async function setPhonePin(userId: string, pin: string) {
  const problem = pinProblem(String(pin ?? ""));
  if (problem) throw new Invalid(problem);
  await run("UPDATE users SET phone_pin_hash = ?, phone_pin_failures = 0, phone_pin_locked_until = NULL WHERE id = ?", hashPassword(String(pin)), userId);
  await audit.log({ id: userId, orgId: null }, null, "phone.pin_set", {});
}

export async function hasPhonePin(userId: string) {
  return !!(await get<{ phone_pin_hash: string | null }>("SELECT phone_pin_hash FROM users WHERE id = ?", userId))?.phone_pin_hash;
}

export async function phonePinLocked(userId: string) {
  const r = await get<{ phone_pin_locked_until: string | null }>("SELECT phone_pin_locked_until FROM users WHERE id = ?", userId);
  return !!r?.phone_pin_locked_until && r.phone_pin_locked_until > now();
}

export async function verifyPhonePin(userId: string, pin: string) {
  const r = await get<{ phone_pin_hash: string | null; phone_pin_failures: number; phone_pin_locked_until: string | null }>("SELECT phone_pin_hash, phone_pin_failures, phone_pin_locked_until FROM users WHERE id = ?", userId);
  if (!r?.phone_pin_hash) return false;
  if (r.phone_pin_locked_until && r.phone_pin_locked_until > now()) return false;
  if (verifyPassword(String(pin ?? ""), r.phone_pin_hash)) {
    await run("UPDATE users SET phone_pin_failures = 0, phone_pin_locked_until = NULL WHERE id = ?", userId);
    await audit.log({ id: userId, orgId: null }, null, "phone.pin_ok", {});
    return true;
  }
  const failures = Number(r.phone_pin_failures ?? 0) + 1;
  const lock = failures >= PIN_MAX_FAILURES ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null;
  await run("UPDATE users SET phone_pin_failures = ?, phone_pin_locked_until = ? WHERE id = ?", lock ? 0 : failures, lock, userId);
  await audit.log({ id: userId, orgId: null }, null, lock ? "phone.pin_locked" : "phone.pin_failed", { failures });
  return false;
}

export async function userByPhone(e164: string): Promise<User | null> {
  const phone = normalizePhone(e164 ?? "");
  if (!phone) return null;
  const r = await get<{ id: string }>("SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL", phone);
  return r ? ((await actorFor(r.id)) ?? null) : null;
}
