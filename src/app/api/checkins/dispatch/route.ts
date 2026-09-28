import { dispatchDue } from "@/lib/server/checkin";
import { authed, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";

export const POST = authed(async (req, user) => {
  assertCan(user, "clinical.edit");
  return json({ sent: await dispatchDue(user.orgId, new URL(req.url).origin) });
});
