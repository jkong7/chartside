import { authed, body, json } from "@/lib/server/http";
import { confirmPhoneVerification } from "@/lib/server/magic";

export const POST = authed(async (req, user) => {
  const b = await body<{ code?: string }>(req);
  return json(await confirmPhoneVerification(user, b.code ?? ""));
});
