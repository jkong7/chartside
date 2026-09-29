import { authed, body, json } from "@/lib/server/http";
import { isOperator } from "@/lib/server/loops";
import { assertCan, Forbidden } from "@/lib/server/policy";
import { connectNumber, lineCallLog, lineConfig, lineRoster, lineStats } from "@/lib/server/telephony/admin";

export const GET = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const operator = isOperator(user.email);
  const all = new URL(req.url).searchParams.get("scope") === "all" && operator;
  return json({ operator, scope: all ? "all" : "org", config: lineConfig(), stats: await lineStats(all ? null : user.orgId), roster: await lineRoster(user.orgId), calls: await lineCallLog(all ? null : user.orgId) });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "org.manage");
  if (!isOperator(user.email)) throw new Forbidden("Only a Chartside operator can point the phone number at this deployment");
  const b = await body<{ number?: string }>(req);
  return json({ connected: await connectNumber(user, b.number ?? "") });
});
