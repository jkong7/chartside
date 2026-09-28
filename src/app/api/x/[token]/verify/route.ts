import { cookies } from "next/headers";
import { fail, json } from "@/lib/server/http";
import { SHARE_COOKIE, verifyCode } from "@/lib/server/sharing";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { code?: string };
  try {
    const { cookie, expires } = await verifyCode(token, String(b.code ?? ""));
    (await cookies()).set(SHARE_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: `/x/${token}`, expires });
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not verify", 422);
  }
}
