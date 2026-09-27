import { authed, body, fail, json } from "@/lib/server/http";
import { processEncounter } from "@/lib/server/pipeline";
import { encounters, utterances } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  if (enc.status === "signed") return fail("This visit is already signed", 409);
  if (!utterances.list(enc.id).length) return fail("Nothing was captured yet", 409);
  const b = await body<{ templateId?: string; durationS?: number }>(req);
  encounters.update(user.id, enc.id, { status: "processing", endedAt: enc.endedAt ?? new Date().toISOString(), durationS: b.durationS ? Math.round(b.durationS) : enc.durationS });
  const result = await processEncounter(user, enc.id, { templateId: b.templateId });
  return json({ ok: true, warnings: result.warnings });
});
