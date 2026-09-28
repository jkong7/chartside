import { gdmtFor } from "@/lib/engine/gdmt";
import { authed, fail, json } from "@/lib/server/http";
import { factsFor } from "@/lib/server/pipeline";
import { encounters, utterances } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const { facts, patient } = await factsFor(user, enc);
  const g = gdmtFor(await utterances.list(enc.id), facts, patient?.chart);
  return json({ ef: g.ef?.ef ?? null, pillars: g.pillars });
});
