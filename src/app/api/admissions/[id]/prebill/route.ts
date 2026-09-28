import { authed, body, json } from "@/lib/server/http";
import { answerQuery, prebillFor } from "@/lib/server/prebill";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json(await prebillFor(user, id)));

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ key?: string; option?: string }>(req);
  return json(await answerQuery(user, id, b.key ?? "", b.option ?? ""));
});
