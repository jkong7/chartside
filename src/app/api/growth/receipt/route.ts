import { createReceipt, receiptStats } from "@/lib/server/growth";
import { assertNotGuest } from "@/lib/server/guest";
import { authed, json } from "@/lib/server/http";

export const GET = authed(async (_req, user) => json(await receiptStats(user)));

export const POST = authed(async (_req, user) => {
  assertNotGuest(user, "share a receipt");
  return json(await createReceipt(user), 201);
});
