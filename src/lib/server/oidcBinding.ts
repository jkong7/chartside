import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "cs_oidc";
const hash = (v: string) => createHash("sha256").update(`oidc:${v}`).digest("hex");

export async function bindBrowser() {
  const v = randomBytes(24).toString("base64url");
  (await cookies()).set(COOKIE, v, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: 900 });
  return hash(v);
}

export async function sameBrowser(stored: string | null | undefined) {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  if (!stored || !v) return false;
  const a = Buffer.from(hash(v));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}
