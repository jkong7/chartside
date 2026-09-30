import { cookies } from "next/headers";
import { currentUser, endSession, publicUser, startSession } from "@/lib/server/auth";
import { attributeReferral, REF_COOKIE } from "@/lib/server/growth";
import { body, fail, json } from "@/lib/server/http";
import { recordSignup, touchFromCookies } from "@/lib/server/loops";
import { claimGuestByPhone } from "@/lib/server/magic";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";
import { mfaStatus } from "@/lib/server/security";
import { browserTz } from "@/lib/server/tz";

export async function POST(req: Request) {
  if (limited(`claimphonev:${clientIp(req)}`, 2 * Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  const u = await currentUser();
  if (!u?.guestUntil) return fail("Only an unsaved visit can be saved this way", 403);
  const b = await body<{ code?: string; name?: string; npi?: string }>(req);
  try {
    const r = await claimGuestByPhone(u, b.code ?? "", { name: b.name, npi: b.npi, tz: (await browserTz()) ?? undefined });
    if (!r.created && (await mfaStatus(r.user.id)).enabled) {
      await endSession();
      return json({ mfa: true, next: "/go/stack" });
    }
    if (r.created) {
      await attributeReferral(r.user.id, (await cookies()).get(REF_COOKIE)?.value);
      await recordSignup(r.user.id, await touchFromCookies(await cookies()));
    }
    await endSession();
    await startSession(r.user.id, r.user.orgId);
    return json({ user: publicUser(r.user), created: r.created, claimed: r.claimed });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "That code didn't work", 422);
  }
}
