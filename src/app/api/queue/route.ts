import { authed, body, json } from "@/lib/server/http";
import { signClean, unsignedQueue } from "@/lib/server/queue";

export const GET = authed(async (_req, user) => json({ queue: await unsignedQueue(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ ids?: string[] }>(req);
  const results = await signClean(user, b.ids ?? []);
  return json({ results, queue: await unsignedQueue(user) });
});
