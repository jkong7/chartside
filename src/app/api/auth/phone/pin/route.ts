import { authed, body, json } from "@/lib/server/http";
import { hasPhonePin, setPhonePin } from "@/lib/server/magic";
import { assertNotGuest } from "@/lib/server/guest";

export const GET = authed(async (_req, user) => json({ set: await hasPhonePin(user.id), phone: user.phone ? user.phone.replace(/\d(?=\d{4})/g, "•") : null }));

export const POST = authed(async (req, user) => {
  assertNotGuest(user, "set a phone PIN");
  const b = await body<{ pin?: string }>(req);
  await setPhonePin(user.id, b.pin ?? "");
  return json({ set: true });
});
