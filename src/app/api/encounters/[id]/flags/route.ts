import { authed, body, fail, json } from "@/lib/server/http";
import { encounters, patientFlags } from "@/lib/server/repo";

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ flagId?: string }>(req);
  if (!b.flagId) return fail("flagId is required");
  await patientFlags.resolve(enc.id, b.flagId);
  return json({ flags: await patientFlags.list(enc.id) });
});
