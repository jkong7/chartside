import { authed, body, json } from "@/lib/server/http";
import { EVENTS, webhooks } from "@/lib/server/platform";
import { assertCan } from "@/lib/server/policy";

export const GET = authed(async (_req, user) => {
  assertCan(user, "org.manage");
  return json({ webhooks: await webhooks.list(user), deliveries: await webhooks.deliveries(user), events: EVENTS });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const r = await webhooks.create(user, await body(req));
  return json({ ...r, webhooks: await webhooks.list(user) }, 201);
});
