import { startSession, publicUser } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { actorFor, audit } from "@/lib/server/repo";
import { redeemChallenge } from "@/lib/server/security";

export async function POST(req: Request) {
  const b = await body<{ challenge?: string; code?: string }>(req);
  try {
    const { userId, orgId } = await redeemChallenge(b.challenge ?? "", b.code ?? "");
    const actor = await actorFor(userId, orgId);
    if (!actor) return fail("Your access to Chartside has been disabled", 403);
    await startSession(userId, orgId);
    await audit.log(actor, null, "user.login", { method: "password+totp" });
    return json({ user: publicUser(actor) });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Verification failed", 401);
  }
}
