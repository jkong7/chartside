import { authed, body, json } from "@/lib/server/http";
import { snippets } from "@/lib/server/snippets";

export const GET = authed(async (_req, user) => json({ snippets: await snippets.list(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ trigger?: string; name?: string; body?: string; shared?: boolean }>(req);
  const id = await snippets.save(user, b);
  return json({ id, snippets: await snippets.list(user) }, 201);
});
