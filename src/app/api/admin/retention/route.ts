import { authed, body, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import { orgRetention, setRetention } from "@/lib/server/retention";

export const GET = authed(async (_req, user) => {
  assertCan(user, "org.manage");
  return json(await orgRetention(user.orgId));
});

export const PUT = authed(async (req, user) => {
  const b = await body<{ transcriptDays?: number | null }>(req);
  const purged = await setRetention(user, b);
  return json({ ...(await orgRetention(user.orgId)), purged });
});
