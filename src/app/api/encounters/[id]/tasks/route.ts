import { authed, fail, json } from "@/lib/server/http";
import { tasks } from "@/lib/server/inbox";
import { encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  return json({ tasks: await tasks.forEncounter(enc.id) });
});
