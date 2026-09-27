import { authed, body, fail, json } from "@/lib/server/http";
import { encounters, feedback } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ section?: string; rating?: number; comment?: string }>(req);
  if (!b.section || (b.rating !== 1 && b.rating !== -1)) return fail("Section and rating (+1/-1) are required");
  feedback.add(enc.id, b.section, b.rating, b.comment ?? "");
  return json({ ok: true, feedback: feedback.forEncounter(enc.id) });
});
