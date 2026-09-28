import { CATALOG } from "@/lib/engine/ordersets";
import { authed, body, json } from "@/lib/server/http";
import { listOrderSets, saveOrderSet } from "@/lib/server/ordersets";
import type { OrderSetItem } from "@/lib/engine/ordersets";

export const GET = authed(async (_req, user) => json({ sets: await listOrderSets(user), catalog: CATALOG }));

export const POST = authed(async (req, user) => {
  const b = await body<{ name?: string; items?: OrderSetItem[]; scope?: "org" | "personal" }>(req);
  return json({ set: await saveOrderSet(user, b) }, 201);
});
