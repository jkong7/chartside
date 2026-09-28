import { authed, body, json } from "@/lib/server/http";
import { snippets } from "@/lib/server/snippets";

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ trigger?: string; name?: string; body?: string; shared?: boolean }>(req);
  await snippets.save(user, { ...b, id });
  return json({ snippets: await snippets.list(user) });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await snippets.remove(user, id);
  return json({ snippets: await snippets.list(user) });
});
