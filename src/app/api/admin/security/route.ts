import { authed, body, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import { orgSecurity, rotateScimToken, updateOrgSecurity } from "@/lib/server/security";

export const GET = authed(async (_req, user) => {
  assertCan(user, "org.manage");
  const s = await orgSecurity(user.orgId);
  return json({ requireMfa: !!s.requireMfa, idleMinutes: s.idleMinutes ?? 30, scim: s.scim ? { createdAt: s.scim.createdAt, defaultRole: s.scim.defaultRole } : null });
});

export const PATCH = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const b = await body<{ requireMfa?: boolean; idleMinutes?: number; rotateScim?: boolean; scimRole?: string }>(req);
  if (b.rotateScim) return json({ token: await rotateScimToken(user, b.scimRole ?? "clinician") });
  const s = await updateOrgSecurity(user, b);
  return json({ requireMfa: !!s.requireMfa, idleMinutes: s.idleMinutes ?? 30 });
});
