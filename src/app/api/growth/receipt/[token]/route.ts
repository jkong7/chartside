import { revokeReceipt } from "@/lib/server/growth";
import { authed, json } from "@/lib/server/http";

export const DELETE = authed<{ token: string }>(async (_req, user, { token }) => {
  await revokeReceipt(user, token);
  return json({ ok: true });
});
