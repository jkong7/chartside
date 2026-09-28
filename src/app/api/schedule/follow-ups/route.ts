import { authed, body, json } from "@/lib/server/http";
import { bookFollowUp, followUpQueue } from "@/lib/server/schedule";

export const GET = authed(async (_req, user) => json({ queue: await followUpQueue(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ taskId?: string; when?: string }>(req);
  const enc = await bookFollowUp(user, b.taskId ?? "", b.when ?? "");
  return json({ encounter: enc, queue: await followUpQueue(user) }, 201);
});
