import { authed, json } from "@/lib/server/http";
import { isVerifiedOperator, loopMetrics } from "@/lib/server/loops";
import { assertCan } from "@/lib/server/policy";

export const GET = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const all = new URL(req.url).searchParams.get("scope") === "all" && (await isVerifiedOperator(user));
  return json({ scope: all ? "all" : "org", operator: (await isVerifiedOperator(user)), ...(await loopMetrics({ orgId: all ? null : user.orgId })) });
});
