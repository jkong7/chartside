import { authed, json } from "@/lib/server/http";
import { deleteOrderSet } from "@/lib/server/ordersets";

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await deleteOrderSet(user, id);
  return json({ ok: true });
});
