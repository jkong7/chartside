import { hl7Config, hl7Log, saveHl7Config, type Hl7Config } from "@/lib/server/hl7";
import { authed, body, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";

export const GET = authed(async (_req, user) => {
  assertCan(user, "org.manage");
  return json({ config: await hl7Config(user.orgId), log: await hl7Log(user) });
});

export const PUT = authed(async (req, user) => json({ config: await saveHl7Config(user, await body<Partial<Hl7Config>>(req)) }));
