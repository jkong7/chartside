import { adminSnapshot } from "@/lib/server/admin";
import { authed, body, fail, json } from "@/lib/server/http";
import { computeOrgAnalytics } from "@/lib/server/insights";
import { assertCan } from "@/lib/server/policy";
import { audit, orgs } from "@/lib/server/repo";

export const GET = authed(async (_req, user) => {
  assertCan(user, "org.manage");
  const [snap, analytics, log] = await Promise.all([adminSnapshot(user), computeOrgAnalytics(user.orgId), audit.forOrg(user.orgId, 100)]);
  return json({ ...snap, analytics, audit: log });
});

export const PATCH = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const b = await body<{ name?: string; appsRequireCosign?: boolean }>(req);
  if (b.appsRequireCosign !== undefined) {
    const cur = (await orgs.get(user.orgId))!;
    const org = await orgs.update(user.orgId, { settings: { ...cur.settings, appsRequireCosign: !!b.appsRequireCosign } });
    await audit.log(user, null, "org.cosign_policy", { appsRequireCosign: !!b.appsRequireCosign });
    return json({ org });
  }
  const name = b.name?.trim();
  if (!name) return fail("Enter an organization name");
  if (name.length > 120) return fail("That name is too long");
  const org = await orgs.update(user.orgId, { name });
  await audit.log(user, null, "org.renamed", { name });
  return json({ org });
});
