import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { encodeLoopCookie, LOOP_COOKIE, VISITOR_COOKIE, visitorKey } from "@/lib/server/loops";
import { offerInfo, visitLoopClick } from "@/lib/server/patientVisit";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const info = await offerInfo((await ctx.params).token);
  const me = await currentUser().catch(() => null);
  const res = NextResponse.json({ ...info, signedIn: !!me && !me.guestUntil, guest: !!me?.guestUntil, name: me && !me.guestUntil ? me.name : null }, { headers: { "cache-control": "no-store" } });
  if (info.state !== "open") return res;
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: 30 * 86400 };
  const vid = jar.get(VISITOR_COOKIE)?.value ?? randomBytes(12).toString("base64url");
  if (!jar.get(LOOP_COOKIE)) res.cookies.set(LOOP_COOKIE, encodeLoopCookie("patient_visit", null), opts);
  res.cookies.set(VISITOR_COOKIE, vid, { ...opts, maxAge: 365 * 86400 });
  await visitLoopClick(visitorKey(vid));
  return res;
}
