import { saveSso } from "@/lib/server/admin";
import { authed, body, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import type { SsoConfig } from "@/lib/server/repo";

export const PUT = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const b = await body<Partial<SsoConfig>>(req);
  const cfg = await saveSso(user, b);
  return json({ sso: { ...cfg, clientSecret: undefined, hasSecret: !!cfg.clientSecret } });
});
