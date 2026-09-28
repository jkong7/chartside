import { createGroup, groups } from "@/lib/server/group";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed(async (req, user) => {
  const enc = new URL(req.url).searchParams.get("encounter");
  if (enc) return json({ group: (await groups.byEncounter(user, enc)) ?? null });
  return json({ groups: await groups.list(user) });
});

export const POST = authed(async (req, user) => {
  const b = await body<{ title?: string; memberIds?: string[]; scheduledAt?: string }>(req);
  return json(await createGroup(user, b), 201);
});
