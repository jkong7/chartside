import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REF_COOKIE, referrerFor } from "@/lib/server/growth";
import { encodeLoopCookie, LOOP_COOKIE, type LoopId, trackLoop, VISITOR_COOKIE, visitorKey } from "@/lib/server/loops";

const SOURCES = { share: "share", receipt: "receipt", invite: "invite" } as const;

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const src = new URL(req.url).searchParams.get("src") ?? "";
  const loop: LoopId = (SOURCES as Record<string, LoopId>)[src] ?? "referral";
  const res = NextResponse.redirect(new URL(`/line?ref=${encodeURIComponent(code)}${loop === "referral" ? "" : `&src=${loop}`}`, req.url), 303);
  const referrer = await referrerFor(code);
  if (!referrer) return res;
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: 30 * 86400 };
  const vid = (await cookies()).get(VISITOR_COOKIE)?.value ?? randomBytes(12).toString("base64url");
  res.cookies.set(REF_COOKIE, code, opts);
  res.cookies.set(LOOP_COOKIE, encodeLoopCookie(loop, referrer), opts);
  res.cookies.set(VISITOR_COOKIE, vid, { ...opts, maxAge: 365 * 86400 });
  await trackLoop({ loop, kind: "click", inviterId: referrer, visitor: visitorKey(vid) });
  return res;
}
