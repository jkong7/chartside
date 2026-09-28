import { authed, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import { qualityDashboard } from "@/lib/server/quality";

export const GET = authed(async (_req, user) => {
  assertCan(user, "billing.view");
  return json(await qualityDashboard(user));
});
