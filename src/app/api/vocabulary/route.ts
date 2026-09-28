import { authed, body, json } from "@/lib/server/http";
import { vocabulary } from "@/lib/server/snippets";

export const GET = authed(async (_req, user) => json({ vocabulary: await vocabulary.list(user) }));

export const POST = authed(async (req, user) => {
  await vocabulary.add(user, await body(req));
  return json({ vocabulary: await vocabulary.list(user) }, 201);
});
