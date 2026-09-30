import { currentUser } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { requestEmailSignIn, SsoRequired } from "@/lib/server/magic";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  if (limited(`magic:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  const b = await body<{ email?: string; next?: string }>(req);
  const current = await currentUser();
  try {
    return json(await requestEmailSignIn(b.email ?? "", { next: b.next, origin: new URL(req.url).origin, guestUserId: current?.guestUntil ? current.id : null, requesterId: current && !current.guestUntil ? current.id : null }));
  } catch (err) {
    if (err instanceof SsoRequired) return json({ error: err.message, sso: true }, 403);
    return fail(err instanceof Error ? err.message : "Could not send a code", 422);
  }
}
