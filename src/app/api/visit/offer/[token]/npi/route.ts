import { currentUser, endSession, publicUser, startSession } from "@/lib/server/auth";
import { body, json } from "@/lib/server/http";
import { claimWithNpi, visitError } from "@/lib/server/patientVisit";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (limited(`visit-npi:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  try {
    const b = await body<{ npi?: string; state?: string }>(req);
    const r = await claimWithNpi((await ctx.params).token, b);
    if (await currentUser().catch(() => null)) await endSession();
    await startSession(r.user.id, r.user.orgId, 1);
    return json({ user: publicUser(r.user), encounterId: r.encounterId, next: r.next }, 201);
  } catch (err) {
    return visitError(err);
  }
}
