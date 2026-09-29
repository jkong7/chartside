import { cookies } from "next/headers";
import { currentUser, endSession, publicUser, startSession } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { redeemMagic } from "@/lib/server/magic";
import { attributeReferral, REF_COOKIE } from "@/lib/server/growth";
import { recordSignup, touchFromCookies } from "@/lib/server/loops";
import { Forbidden } from "@/lib/server/policy";
import { createChallenge, mfaStatus } from "@/lib/server/security";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  if (limited(`magicv:${clientIp(req)}`, 2 * Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  const b = await body<{ token?: string; email?: string; code?: string }>(req);
  if (!b.token && !(b.email && b.code)) return fail("Send the link token, or the email and code");
  const current = await currentUser();
  try {
    const r = await redeemMagic(b, current);
    if (current && current.id !== r.user.id) await endSession();
    if ((await mfaStatus(r.user.id)).enabled) return json({ mfa: true, challenge: await createChallenge(r.user.id, r.user.orgId), next: r.next });
    if (r.created) await attributeReferral(r.user.id, (await cookies()).get(REF_COOKIE)?.value);
    if (r.created) await recordSignup(r.user.id, await touchFromCookies(await cookies()));
    await startSession(r.user.id, r.user.orgId);
    return json({ user: publicUser(r.user), next: r.next, created: r.created, claimed: r.claimed });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Sign-in failed", err instanceof Forbidden ? 403 : 401);
  }
}
