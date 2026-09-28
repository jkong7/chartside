import { authed, json } from "@/lib/server/http";
import { vocabulary } from "@/lib/server/snippets";

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await vocabulary.remove(user, id);
  return json({ vocabulary: await vocabulary.list(user) });
});
