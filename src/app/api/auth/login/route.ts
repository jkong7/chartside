import { publicUser, startSession, verifyPassword } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { actorFor, audit, orgs, users } from "@/lib/server/repo";
import { createChallenge, mfaStatus } from "@/lib/server/security";

export async function POST(req: Request) {
  const b = await body<{ email?: string; password?: string }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  const sso = await orgs.requiringSso(email.split("@")[1] ?? "");
  if (sso) return json({ error: `${sso.name} requires single sign-on. Continue with SSO.`, sso: true }, 403);
  const row = await users.byEmail(email);
  if (!row || !row.password_hash || !verifyPassword(b.password ?? "", row.password_hash)) return fail("Incorrect email or password", 401);
  const actor = await actorFor(row.id);
  if (!actor) return fail("Your access to Chartside has been disabled. Contact your administrator.", 403);
  if ((await mfaStatus(row.id)).enabled) {
    await audit.log(actor, null, "user.mfa_challenged", {});
    return json({ mfa: true, challenge: await createChallenge(row.id, actor.orgId) });
  }
  await startSession(row.id, actor.orgId);
  await audit.log(actor, null, "user.login", { method: "password" });
  return json({ user: publicUser(actor) });
}
