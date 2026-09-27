import { sessionToken } from "@/lib/server/auth";
import { authed, body, fail, json } from "@/lib/server/http";
import { actorFor, audit, sessions } from "@/lib/server/repo";

export const POST = authed(async (req, user) => {
  const b = await body<{ orgId?: string }>(req);
  const next = b.orgId ? await actorFor(user.id, b.orgId) : undefined;
  if (!next || next.orgId !== b.orgId) return fail("You are not a member of that organization", 403);
  const token = await sessionToken();
  if (token) await sessions.setOrg(token, next.orgId);
  await audit.log(next, null, "org.switched", { from: user.orgId });
  return json({ orgId: next.orgId, role: next.role });
});
