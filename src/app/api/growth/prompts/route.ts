import { markPromptSeen } from "@/lib/server/growth";
import { authed, body, json } from "@/lib/server/http";

export const POST = authed(async (req, user) => {
  const b = await body<{ prompt?: string }>(req);
  await markPromptSeen(user, b.prompt ?? "");
  return json({ ok: true });
});
