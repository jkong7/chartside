import { authed, body, json } from "@/lib/server/http";
import { locations, saveLocation } from "@/lib/server/locations";

export const GET = authed(async (_req, user) => json({ locations: await locations.list(user.orgId, ["owner", "admin"].includes(user.role)), mine: user.prefs.locationId ?? null }));

export const POST = authed(async (req, user) => {
  const b = await body<{ id?: string; name?: string; address?: string; pos?: string; archived?: boolean }>(req);
  return json({ location: await saveLocation(user, b) }, b.id ? 200 : 201);
});
