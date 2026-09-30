import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "cs_oidc";
const hash = (v: string) => createHash("sha256").update(`oidc:${v}`).digest("hex");

export function newBinding() {
  const value = randomBytes(24).toString("base64url");
  return { value, hash: hash(value) };
}

export function bindingMatches(stored: string | null | undefined, value: string | null | undefined) {
  if (!stored || !value) return false;
  const a = Buffer.from(hash(value));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setBindingCookie(value: string) {
  (await cookies()).set(COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: 900 });
}

export async function takeBindingCookie() {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value ?? null;
  jar.delete(COOKIE);
  return v;
}
