import { setOwnerTexts } from "@/lib/server/barn";
import { authed, body, json } from "@/lib/server/http";
import { orgJurisdiction, setJurisdiction } from "@/lib/server/jurisdiction";
import { isVerifiedOperator } from "@/lib/server/loops";
import { assertCan, Forbidden, Invalid } from "@/lib/server/policy";
import { orgs } from "@/lib/server/repo";
import { connectNumber, lineCallLog, lineConfig, lineRoster, lineStats, speechCheck } from "@/lib/server/telephony/admin";

export const GET = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const operator = (await isVerifiedOperator(user));
  const all = new URL(req.url).searchParams.get("scope") === "all" && operator;
  return json({ operator, scope: all ? "all" : "org", jurisdiction: await orgJurisdiction(user.orgId), ownerTexts: (await orgs.get(user.orgId))?.settings.ownerTexts === true, owner: user.role === "owner", whatsappUrl: lineConfig().publicUrl ? `${lineConfig().publicUrl}/api/whatsapp/incoming` : null, config: lineConfig(), stats: await lineStats(all ? null : user.orgId), roster: await lineRoster(user.orgId), calls: await lineCallLog(all ? null : user.orgId) });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const b = await body<{ number?: string; check?: string; jurisdiction?: string; ownerTexts?: unknown }>(req);
  if (b.ownerTexts !== undefined) {
    if (typeof b.ownerTexts !== "boolean") throw new Invalid("ownerTexts must be true or false");
    return json({ ownerTexts: await setOwnerTexts(user, b.ownerTexts) });
  }
  if (b.jurisdiction !== undefined) return json({ jurisdiction: await setJurisdiction(user, b.jurisdiction) });
  if (!(await isVerifiedOperator(user))) throw new Forbidden("Only a Chartside operator can change or test the line for this deployment");
  if (b.check === "speech") return json(await speechCheck());
  return json({ connected: await connectNumber(user, b.number ?? "") });
});
