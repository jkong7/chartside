import { authed, json } from "@/lib/server/http";
import { isOperator, loopMetrics } from "@/lib/server/loops";
import { assertCan } from "@/lib/server/policy";

export const GET = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const all = new URL(req.url).searchParams.get("scope") === "all" && isOperator(user.email);
  return json({ scope: all ? "all" : "org", operator: isOperator(user.email), ...(await loopMetrics({ orgId: all ? null : user.orgId })) });
});
