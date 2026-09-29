import { authed, body, json } from "@/lib/server/http";
import { isOperator } from "@/lib/server/loops";
import { assertCan, Forbidden } from "@/lib/server/policy";
import { connectNumber, lineCallLog, lineConfig, lineRoster, lineStats, speechCheck } from "@/lib/server/telephony/admin";

export const GET = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const operator = isOperator(user.email);
  const all = new URL(req.url).searchParams.get("scope") === "all" && operator;
  return json({ operator, scope: all ? "all" : "org", config: lineConfig(), stats: await lineStats(all ? null : user.orgId), roster: await lineRoster(user.orgId), calls: await lineCallLog(all ? null : user.orgId) });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "org.manage");
  if (!isOperator(user.email)) throw new Forbidden("Only a Chartside operator can change or test the line for this deployment");
  const b = await body<{ number?: string; check?: string }>(req);
  if (b.check === "speech") return json(await speechCheck());
  return json({ connected: await connectNumber(user, b.number ?? "") });
});
