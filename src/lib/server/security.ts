import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { all, get, now, run } from "../db";
import { seal, unseal } from "../fhir/crypto";
import { Forbidden, Invalid } from "./policy";
import { audit, j, orgs, users, type User } from "./repo";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(secret: string, counter: number, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totp(secret: string, at = Date.now()) {
  return hotp(secret, Math.floor(at / 30000));
}

export function verifyTotp(secret: string, code: string, at = Date.now(), window = 1) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(at / 30000);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, step + w);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return true;
  }
  return false;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface SecuritySettings {
  requireMfa?: boolean;
  idleMinutes?: number;
  scim?: { tokenHash: string; createdAt: string; defaultRole: string } | null;
}

export async function orgSecurity(orgId: string): Promise<SecuritySettings> {
  const o = await orgs.get(orgId);
  return (o?.settings as { security?: SecuritySettings } | undefined)?.security ?? {};
}

export async function updateOrgSecurity(u: User, patch: { requireMfa?: boolean; idleMinutes?: number }) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only owners and admins can change security settings");
  const o = (await orgs.get(u.orgId))!;
  const cur = (o.settings as { security?: SecuritySettings }).security ?? {};
  const idle = patch.idleMinutes === undefined ? cur.idleMinutes : [15, 30, 60, 120, 480].includes(patch.idleMinutes) ? patch.idleMinutes : null;
  if (idle === null) throw new Invalid("Choose 15, 30, 60, 120, or 480 minutes");
  if (patch.requireMfa && !(await mfaStatus(u.id)).enabled) throw new Invalid("Turn on two-step verification for your own account first");
  const next = { ...cur, requireMfa: patch.requireMfa ?? cur.requireMfa, idleMinutes: idle };
  await orgs.update(u.orgId, { settings: { ...o.settings, security: next } as typeof o.settings });
  await audit.log(u, null, "security.updated", { requireMfa: next.requireMfa ?? false, idleMinutes: next.idleMinutes ?? 30 });
  return next;
}

export async function mfaStatus(userId: string) {
  const r = await get<{ mfa_secret: string | null; mfa_enabled_at: string | null; mfa_recovery: string | null }>("SELECT mfa_secret, mfa_enabled_at, mfa_recovery FROM users WHERE id = ?", userId);
  return { enabled: !!r?.mfa_enabled_at, enabledAt: r?.mfa_enabled_at ?? null, recoveryLeft: j<string[]>(r?.mfa_recovery, []).length };
}

export async function startEnrollment(u: User) {
  const secret = base32Encode(randomBytes(20));
  await run("UPDATE users SET mfa_secret = ?, mfa_enabled_at = NULL WHERE id = ?", seal(secret), u.id);
  const label = encodeURIComponent(`Chartside:${u.email}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Chartside&algorithm=SHA1&digits=6&period=30` };
}

export async function confirmEnrollment(u: User, code: string) {
  const r = await get<{ mfa_secret: string | null }>("SELECT mfa_secret FROM users WHERE id = ?", u.id);
  if (!r?.mfa_secret) throw new Invalid("Start setup first");
  if (!verifyTotp(unseal(r.mfa_secret), code)) throw new Invalid("That code didn't match. Check the time on your phone and try the newest code.");
  const codes = Array.from({ length: 10 }, () => randomBytes(5).toString("hex").replace(/(.{5})/, "$1-"));
  await run("UPDATE users SET mfa_enabled_at = ?, mfa_recovery = ? WHERE id = ?", now(), JSON.stringify(codes.map(sha)), u.id);
  await audit.log(u, null, "mfa.enabled", {});
  return { recoveryCodes: codes };
}

export async function disableMfa(u: User, code: string) {
  const sec = await orgSecurity(u.orgId);
  if (sec.requireMfa) throw new Forbidden("Your organization requires two-step verification");
  if (!(await checkSecondFactor(u.id, code))) throw new Invalid("That code didn't match");
  await run("UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL, mfa_recovery = NULL WHERE id = ?", u.id);
  await audit.log(u, null, "mfa.disabled", {});
}

export async function checkSecondFactor(userId: string, code: string) {
  const r = await get<{ mfa_secret: string | null; mfa_enabled_at: string | null; mfa_recovery: string | null }>("SELECT mfa_secret, mfa_enabled_at, mfa_recovery FROM users WHERE id = ?", userId);
  if (!r?.mfa_secret || !r.mfa_enabled_at) return false;
  if (verifyTotp(unseal(r.mfa_secret), code)) return true;
  const rec = j<string[]>(r.mfa_recovery, []);
  const h = sha(code.trim().toLowerCase());
  if (rec.includes(h)) {
    await run("UPDATE users SET mfa_recovery = ? WHERE id = ?", JSON.stringify(rec.filter((x) => x !== h)), userId);
    return true;
  }
  return false;
}

export async function createChallenge(userId: string, orgId: string) {
  const token = randomBytes(24).toString("base64url");
  await run("INSERT INTO mfa_challenges (token, user_id, org_id, attempts, expires_at) VALUES (?, ?, ?, 0, ?)", token, userId, orgId, new Date(Date.now() + 5 * 60000).toISOString());
  return token;
}

export async function redeemChallenge(token: string, code: string) {
  const c = await get<{ user_id: string; org_id: string; attempts: number; expires_at: string }>("SELECT * FROM mfa_challenges WHERE token = ?", token);
  if (!c || new Date(c.expires_at) < new Date() || c.attempts >= 5) {
    if (c) await run("DELETE FROM mfa_challenges WHERE token = ?", token);
    throw new Invalid("This sign-in attempt expired. Enter your password again.");
  }
  if (!(await checkSecondFactor(c.user_id, code))) {
    await run("UPDATE mfa_challenges SET attempts = attempts + 1 WHERE token = ?", token);
    throw new Invalid("That code didn't match");
  }
  await run("DELETE FROM mfa_challenges WHERE token = ?", token);
  return { userId: c.user_id, orgId: c.org_id };
}

export const sessionId = (token: string) => sha(token).slice(0, 16);

export async function listSessions(u: User, current: string | null) {
  return (await all<{ token: string; org_id: string | null; created_at: string | null; last_seen_at: string | null; user_agent: string | null; expires_at: string }>("SELECT token, org_id, created_at, last_seen_at, user_agent, expires_at FROM auth_sessions WHERE user_id = ? ORDER BY last_seen_at DESC", u.id)).map((s) => ({ id: sessionId(s.token), current: s.token === current, createdAt: s.created_at, lastSeenAt: s.last_seen_at, device: describeAgent(s.user_agent) }));
}

export async function revokeSession(u: User, id: string) {
  const rows = await all<{ token: string }>("SELECT token FROM auth_sessions WHERE user_id = ?", u.id);
  const t = rows.find((r) => sessionId(r.token) === id);
  if (!t) throw new Error("Session not found");
  await run("DELETE FROM auth_sessions WHERE token = ?", t.token);
  await audit.log(u, null, "session.revoked", { id });
}

export async function signOutEverywhere(u: User, keep: string | null) {
  await run(`DELETE FROM auth_sessions WHERE user_id = ?${keep ? " AND token <> ?" : ""}`, ...(keep ? [u.id, keep] : [u.id]));
  await audit.log(u, null, "session.signed_out_everywhere", {});
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl|node|undici/i.test(ua) ? "API client" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export async function rotateScimToken(u: User, defaultRole = "clinician") {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only owners and admins can manage provisioning");
  const token = `scim_${randomBytes(24).toString("base64url")}`;
  const o = (await orgs.get(u.orgId))!;
  const cur = (o.settings as { security?: SecuritySettings }).security ?? {};
  await orgs.update(u.orgId, { settings: { ...o.settings, security: { ...cur, scim: { tokenHash: sha(token), createdAt: now(), defaultRole } } } as typeof o.settings });
  await audit.log(u, null, "scim.token_rotated", {});
  return token;
}

export async function scimOrg(req: Request) {
  const m = /^Bearer\s+(scim_[A-Za-z0-9_-]+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const h = sha(m[1]);
  const rows = await all<{ id: string; settings: string }>("SELECT id, settings FROM organizations");
  const hit = rows.find((r) => j<{ security?: SecuritySettings }>(r.settings, {}).security?.scim?.tokenHash === h);
  if (!hit) return null;
  const s = j<{ security?: SecuritySettings }>(hit.settings, {}).security!.scim!;
  return { orgId: hit.id, defaultRole: s.defaultRole };
}

export { users };
