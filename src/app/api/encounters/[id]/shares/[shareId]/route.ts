import { authed, json } from "@/lib/server/http";
import { revokeShare } from "@/lib/server/sharing";

export const DELETE = authed<{ id: string; shareId: string }>(async (_req, user, { id, shareId }) => {
  await revokeShare(user, id, shareId);
  return json({ ok: true });
});
