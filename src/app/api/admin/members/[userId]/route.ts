import { removeMember, updateMember } from "@/lib/server/admin";
import { authed, body, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import { orgs, type Role } from "@/lib/server/repo";

export const PATCH = authed<{ userId: string }>(async (req, user, { userId }) => {
  assertCan(user, "org.manage");
  const b = await body<{ role?: Role; status?: "active" | "disabled" }>(req);
  await updateMember(user, userId, b);
  return json({ members: await orgs.members(user.orgId) });
});

export const DELETE = authed<{ userId: string }>(async (_req, user, { userId }) => {
  assertCan(user, "org.manage");
  await removeMember(user, userId);
  return json({ members: await orgs.members(user.orgId) });
});
