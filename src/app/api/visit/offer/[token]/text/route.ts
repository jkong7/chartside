import { json } from "@/lib/server/http";
import { sendOfferTextCode, visitError } from "@/lib/server/patientVisit";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (limited(`visit-offer-text:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  try {
    return json(await sendOfferTextCode((await ctx.params).token));
  } catch (err) {
    return visitError(err);
  }
}
