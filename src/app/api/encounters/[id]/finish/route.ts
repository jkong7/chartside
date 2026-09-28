import { assertCan } from "@/lib/server/policy";
import { authed, body, fail, json } from "@/lib/server/http";
import { processEncounter } from "@/lib/server/pipeline";
import { audioChunks, encounters, utterances } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.capture");
  if (enc.status === "signed") return fail("This visit is already signed", 409);
  if (!(await utterances.list(enc.id)).length && !(await audioChunks.list(enc.id)).length) return fail("Nothing was captured yet", 409);
  const b = await body<{ templateId?: string; durationS?: number; detail?: "concise" | "standard" | "detailed" }>(req);
  if (b.detail && !["concise", "standard", "detailed"].includes(b.detail)) return fail("Unknown detail level");
  await encounters.update(user, enc.id, { status: "processing", endedAt: enc.endedAt ?? new Date().toISOString(), durationS: b.durationS ? Math.round(b.durationS) : enc.durationS });
  try {
    const result = await processEncounter(user, enc.id, { templateId: b.templateId, detail: b.detail });
    return json({ ok: true, warnings: result.warnings });
  } catch (err) {
    await encounters.update(user, enc.id, { status: "paused" });
    return fail(err instanceof Error ? err.message : "Could not draft the note", 422);
  }
});
