import { cookies } from "next/headers";
import { body, json } from "@/lib/server/http";
import { CLAIM_COOKIE, checkOfferTextCode, visitError } from "@/lib/server/patientVisit";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (limited(`visit-offer-textv:${clientIp(req)}`, 2 * Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  try {
    const b = await body<{ code?: string }>(req);
    const r = await checkOfferTextCode((await ctx.params).token, b.code);
    (await cookies()).set(CLAIM_COOKIE, r.cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/", maxAge: r.maxAge });
    return json({ confirmed: true });
  } catch (err) {
    return visitError(err);
  }
}
