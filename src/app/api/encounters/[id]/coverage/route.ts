import { authed, fail, json } from "@/lib/server/http";
import { liveCoverage } from "@/lib/server/pipeline";
import { encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>((_req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  return json(liveCoverage(user, enc));
});
