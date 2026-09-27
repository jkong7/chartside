import { authed, body, fail, json } from "@/lib/server/http";
import { signEncounter } from "@/lib/server/pipeline";
import { encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ force?: boolean }>(req);
  const out = signEncounter(user, enc.id, { force: !!b.force });
  return json(out, out.signed ? 200 : 409);
});
