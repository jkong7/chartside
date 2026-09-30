import { currentUser } from "@/lib/server/auth";
import { body, json } from "@/lib/server/http";
import { SsoRequired } from "@/lib/server/magic";
import { requestOfferEmailCode, visitError } from "@/lib/server/patientVisit";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (limited(`visit-offer-email:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  try {
    const b = await body<{ email?: string }>(req);
    const me = await currentUser().catch(() => null);
    const r = await requestOfferEmailCode((await ctx.params).token, b.email, { origin: new URL(req.url).origin, guestUserId: me?.guestUntil ? me.id : null });
    return json({ email: r.email });
  } catch (err) {
    if (err instanceof SsoRequired) return json({ error: err.message, sso: true }, 403);
    return visitError(err);
  }
}
