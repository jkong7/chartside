import { authed, body, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import { changePlan, planFor, PRICE_PER_SEAT, usage, type Tier } from "@/lib/server/plan";

export const GET = authed(async (req, user) => {
  assertCan(user, "org.manage");
  return json({ plan: await planFor(user.orgId), usage: await usage(user.orgId, new URL(req.url).searchParams.get("month") ?? undefined), pricePerSeat: PRICE_PER_SEAT });
});

export const PUT = authed(async (req, user) => {
  const b = await body<{ tier?: Tier; seats?: number }>(req);
  return json({ plan: await changePlan(user, b) });
});
