import { authed, body, json } from "@/lib/server/http";
import { styleRules } from "@/lib/server/repo";

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ active?: boolean }>(req);
  await styleRules.setActive(user.id, id, !!b.active);
  return json({ rules: await styleRules.list(user.id) });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await styleRules.remove(user.id, id);
  return json({ rules: await styleRules.list(user.id) });
});
