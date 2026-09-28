import { authed, body, json } from "@/lib/server/http";
import { applyOrderSet } from "@/lib/server/ordersets";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ setId?: string }>(req);
  return json(await applyOrderSet(user, id, b.setId ?? ""));
});
