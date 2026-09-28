import { authed, body, json } from "@/lib/server/http";
import { setMyLocation } from "@/lib/server/locations";

export const PUT = authed(async (req, user) => {
  const b = await body<{ locationId?: string }>(req);
  await setMyLocation(user, b.locationId ?? "");
  return json({ ok: true });
});
