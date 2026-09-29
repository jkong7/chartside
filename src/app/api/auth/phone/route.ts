import { authed, body, json } from "@/lib/server/http";
import { requestPhoneVerification } from "@/lib/server/magic";

export const POST = authed(async (req, user) => {
  const b = await body<{ phone?: string }>(req);
  return json(await requestPhoneVerification(user, b.phone ?? ""));
});
