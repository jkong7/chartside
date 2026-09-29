import { authed, body, fail, json } from "@/lib/server/http";
import { controlCall } from "@/lib/server/telephony/live";

export const POST = authed<{ callSid: string }>(async (req, user, { callSid }) => {
  const b = await body<{ action?: string }>(req);
  if (b.action !== "pause" && b.action !== "resume" && b.action !== "end") return fail("Use pause, resume or end", 400);
  if (!(await controlCall(user.id, callSid, b.action))) return fail("No live call", 404);
  return json({ ok: true });
});
