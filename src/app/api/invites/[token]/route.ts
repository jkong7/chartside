import { sessionToken } from "@/lib/server/auth";
import { authed, fail, json } from "@/lib/server/http";
import { actorFor, audit, invites, orgs, sessions } from "@/lib/server/repo";

export const POST = authed<{ token: string }>(async (_req, user, { token }) => {
  const inv = await invites.get(token);
  if (!inv || inv.acceptedAt || new Date(inv.expiresAt) < new Date()) return fail("This invitation is no longer valid", 410);
  if (inv.email !== user.email.toLowerCase()) return fail(`This invitation was sent to ${inv.email}`, 403);
  const existing = await orgs.membership(inv.orgId, user.id);
  if (existing?.status === "disabled") return fail("Your access to this organization was disabled by an administrator", 403);
  if (!existing) await orgs.addMember(inv.orgId, user.id, inv.role);
  await invites.accept(token);
  const actor = (await actorFor(user.id, inv.orgId))!;
  const sess = await sessionToken();
  if (sess) await sessions.setOrg(sess, inv.orgId);
  await audit.log(actor, null, "member.joined", { role: actor.role, via: "invite" });
  return json({ orgId: inv.orgId, role: actor.role });
});
