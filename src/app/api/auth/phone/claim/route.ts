import { currentUser } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { requestGuestPhoneClaim } from "@/lib/server/magic";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  if (limited(`claimphone:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  const u = await currentUser();
  if (!u?.guestUntil) return fail("Only an unsaved visit can be saved this way", 403);
  try {
    return json(await requestGuestPhoneClaim(u));
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not send a code", 422);
  }
}
