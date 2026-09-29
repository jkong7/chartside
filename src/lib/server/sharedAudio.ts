import { randomBytes, timingSafeEqual } from "node:crypto";

interface Held {
  bytes: Buffer;
  mime: string;
  name: string;
  secret: string;
  expires: number;
}

const g = globalThis as unknown as { __chartsideShared?: Map<string, Held> };
const held = (g.__chartsideShared ??= new Map<string, Held>());
export const SHARE_COOKIE = "cs_share";
export const SHARE_TTL_MS = 10 * 60_000;
export const SHARE_TOTAL_BYTES = Number(process.env.CHARTSIDE_SHARE_MEMORY_MB || 300) * 1024 * 1024;

export function heldBytes() {
  let n = 0;
  for (const v of held.values()) n += v.bytes.length;
  return n;
}

function sweep() {
  const t = Date.now();
  for (const [k, v] of held) if (v.expires <= t) held.delete(k);
}

export function holdShared(bytes: Buffer, mime: string, name: string) {
  sweep();
  if (held.size > 200 || heldBytes() + bytes.length > SHARE_TOTAL_BYTES) throw new Error("Too many pending uploads. Try again in a few minutes.");
  const id = randomBytes(18).toString("base64url");
  const secret = randomBytes(24).toString("base64url");
  held.set(id, { bytes, mime, name: name.slice(0, 120), secret, expires: Date.now() + SHARE_TTL_MS });
  return { id, secret };
}

function match(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function peekShared(id: string, secret: string | undefined) {
  sweep();
  const h = held.get(id);
  if (!h || !secret || !match(h.secret, secret)) return null;
  return { name: h.name, bytes: h.bytes.length, mime: h.mime, expiresAt: new Date(h.expires).toISOString() };
}

export function takeShared(id: string, secret: string | undefined) {
  sweep();
  const h = held.get(id);
  if (!h || !secret || !match(h.secret, secret)) return null;
  held.delete(id);
  return h;
}

export function dropShared(id: string, secret: string | undefined) {
  return !!takeShared(id, secret);
}
