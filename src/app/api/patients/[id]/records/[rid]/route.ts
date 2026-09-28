import { authed, body, fail, json } from "@/lib/server/http";
import { reconcile, recordText } from "@/lib/server/records";

export const GET = authed<{ id: string; rid: string }>(async (_req, user, { id, rid }) => {
  const text = await recordText(user, id, rid);
  return text === null ? fail("Record not found", 404) : json({ text });
});

export const POST = authed<{ id: string; rid: string }>(async (req, user, { id, rid }) => {
  const b = await body<{ decisions?: { index: number; action: "accept" | "dismiss" }[] }>(req);
  return json(await reconcile(user, id, rid, b.decisions ?? []));
});
