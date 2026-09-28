import { authed, json } from "@/lib/server/http";
import { pingWebhook, webhooks } from "@/lib/server/platform";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  await pingWebhook(user, id);
  return json({ deliveries: await webhooks.deliveries(user) });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await webhooks.remove(user, id);
  return json({ webhooks: await webhooks.list(user) });
});
