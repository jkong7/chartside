import { NextResponse } from "next/server";
import { REF_COOKIE, referrerFor } from "@/lib/server/growth";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const res = NextResponse.redirect(new URL(`/line?ref=${encodeURIComponent(code)}`, req.url), 303);
  if (await referrerFor(code)) res.cookies.set(REF_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: 30 * 86400 });
  return res;
}
