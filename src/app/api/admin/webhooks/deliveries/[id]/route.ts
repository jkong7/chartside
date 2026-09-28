import { authed, json } from "@/lib/server/http";
import { redeliver, webhooks } from "@/lib/server/platform";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  await redeliver(user, id);
  return json({ deliveries: await webhooks.deliveries(user) });
});
