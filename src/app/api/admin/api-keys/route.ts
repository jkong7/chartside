import { authed, body, json } from "@/lib/server/http";
import { apiKeys, SCOPES } from "@/lib/server/platform";
import { assertCan } from "@/lib/server/policy";

export const GET = authed(async (_req, user) => {
  assertCan(user, "org.manage");
  return json({ keys: await apiKeys.list(user), scopes: SCOPES });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const r = await apiKeys.create(user, await body(req));
  return json({ ...r, keys: await apiKeys.list(user) }, 201);
});
