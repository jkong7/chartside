import { authed, json } from "@/lib/server/http";
import { apiKeys } from "@/lib/server/platform";

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await apiKeys.revoke(user, id);
  return json({ keys: await apiKeys.list(user) });
});
