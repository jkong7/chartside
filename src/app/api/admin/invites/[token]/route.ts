import { authed, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import { audit, invites } from "@/lib/server/repo";

export const DELETE = authed<{ token: string }>(async (_req, user, { token }) => {
  assertCan(user, "org.manage");
  const inv = await invites.get(token);
  if (!inv || inv.orgId !== user.orgId) throw new Error("Invitation not found");
  await invites.revoke(user.orgId, token);
  await audit.log(user, null, "member.invite_revoked", { email: inv.email });
  return json({ ok: true });
});
