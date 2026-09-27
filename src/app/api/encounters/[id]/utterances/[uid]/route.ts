import { authed, body, fail, json } from "@/lib/server/http";
import { audit, encounters, utterances } from "@/lib/server/repo";

export const PATCH = authed<{ id: string; uid: string }>(async (req, user, { id, uid }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  if (enc.status === "signed") return fail("Signed visits are locked", 409);
  const b = await body<{ speaker?: string; text?: string; redacted?: boolean }>(req);
  if (b.speaker && !["clinician", "patient", "other"].includes(b.speaker)) return fail("Invalid speaker");
  const u = await utterances.update(enc.id, uid, b);
  if (!u) return fail("Utterance not found", 404);
  if (b.redacted !== undefined) await audit.log(user, enc.id, b.redacted ? "transcript.redacted" : "transcript.unredacted", { utterance: uid });
  return json({ utterance: u });
});
