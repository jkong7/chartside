import { createHash, randomBytes } from "node:crypto";
import { all, get, now, run, uid } from "../db";
import { assertCan, can, Invalid } from "./policy";
import { actorFor, audit, type User } from "./repo";

export const CAPTURE_SCOPES = ["capture:create", "capture:upload", "capture:read"] as const;
const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 24 * 60;
const MAX_DEVICE_MINUTES = 30 * 24 * 60;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export class CaptureAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function mintCaptureToken(u: User, input: { minutes?: number; label?: string; source: "session" | "api_key" | "phone"; keyId?: string | null; device?: boolean }) {
  assertCan(u, "clinical.capture");
  if (input.device && input.source !== "session") throw new Invalid("Device tokens can only be created while signed in");
  if (input.device && u.guestUntil) throw new Invalid("Save your account before connecting a device");
  const max = input.device ? MAX_DEVICE_MINUTES : MAX_MINUTES;
  const minutes = input.minutes === undefined || input.minutes === null ? (input.device ? MAX_DEVICE_MINUTES : DEFAULT_MINUTES) : Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > max) throw new Invalid(`minutes must be between 5 and ${max}`);
  const token = `cs_cap_${randomBytes(24).toString("base64url")}`;
  const id = uid("cap_");
  const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
  const label = (input.label ?? "").trim().slice(0, 60);
  await run("INSERT INTO capture_tokens (id, org_id, user_id, token_hash, source, key_id, label, expires_at, created_at, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, u.id, sha(token), input.source, input.keyId ?? null, label, expiresAt, now(), input.device ? 1 : 0);
  await audit.log(u, null, "capture_token.created", { id, source: input.source, keyId: input.keyId ?? null, minutes, device: !!input.device });
  return { id, token, expiresAt, scopes: [...CAPTURE_SCOPES] };
}

export async function mintUploadToken(u: User, minutes = 30) {
  assertCan(u, "clinical.capture");
  const token = `cs_cap_${randomBytes(24).toString("base64url")}`;
  const id = uid("cap_");
  const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();
  await run("INSERT INTO capture_tokens (id, org_id, user_id, token_hash, source, key_id, label, expires_at, created_at, device, single_use) VALUES (?, ?, ?, ?, 'phone', NULL, 'Text upload link', ?, ?, 1, 1)", id, u.orgId, u.id, sha(token), expiresAt, now());
  await audit.log(u, null, "capture_token.created", { id, source: "phone", minutes, device: true, singleUse: true });
  return { id, token, expiresAt };
}

export async function claimUploadToken(id: string) {
  const { changes } = await run("UPDATE capture_tokens SET used_at = ? WHERE id = ? AND single_use = 1 AND used_at IS NULL", now(), id);
  if (!changes) throw new CaptureAuthError(410, "This upload link was already used. Text UPLOAD to the line for a new one.");
}

export async function listCaptureTokens(u: User) {
  const rows = await all<{ id: string; label: string; source: string; expires_at: string; last_used_at: string | null; created_at: string }>("SELECT id, label, source, expires_at, last_used_at, created_at FROM capture_tokens WHERE user_id = ? AND revoked_at IS NULL AND single_use = 0 AND expires_at > ? ORDER BY created_at DESC", u.id, now());
  return rows.map((r) => ({ id: r.id, label: r.label || (r.source === "api_key" ? "API" : "Browser"), source: r.source, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, createdAt: r.created_at }));
}

export async function revokeCaptureToken(u: User, id: string) {
  const { changes } = await run("UPDATE capture_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL", now(), id, u.id);
  if (!changes) throw new Error("Capture token not found");
  await audit.log(u, null, "capture_token.revoked", { id });
}

export function bearerCaptureToken(req: Request) {
  const m = /^Bearer\s+(cs_cap_[A-Za-z0-9_-]{32,})$/.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

export async function captureActor(req: Request): Promise<{ user: User; tokenId: string; device: boolean; uploadOnly: boolean } | null> {
  const token = bearerCaptureToken(req);
  if (!token) return null;
  const row = await get<{ id: string; org_id: string; user_id: string; expires_at: string; revoked_at: string | null; device: number; single_use: number }>("SELECT id, org_id, user_id, expires_at, revoked_at, device, single_use FROM capture_tokens WHERE token_hash = ?", sha(token));
  if (!row || row.revoked_at) throw new CaptureAuthError(401, "Invalid or revoked capture token");
  if (row.expires_at < now()) throw new CaptureAuthError(401, "This capture token has expired. Mint a new one.");
  const user = await actorFor(row.user_id, row.org_id);
  if (!user || user.orgId !== row.org_id || !can(user, "clinical.capture")) throw new CaptureAuthError(403, "The token's clinician can no longer record in this organization");
  await run("UPDATE capture_tokens SET last_used_at = ? WHERE id = ?", now(), row.id);
  return { user, tokenId: row.id, device: !!Number(row.device), uploadOnly: !!Number(row.single_use) };
}
