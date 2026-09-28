import { breakGlass } from "@/lib/server/access";
import { authed, body, json } from "@/lib/server/http";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ reason?: string; detail?: string }>(req);
  await breakGlass(user, id, b);
  return json({ ok: true });
});
