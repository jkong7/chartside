import { authed, body, fail, json } from "@/lib/server/http";
import { audit, encounters, utterances } from "@/lib/server/repo";

export const PATCH = authed<{ id: string; uid: string }>(async (req, user, { id, uid }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  if (enc.status === "signed") return fail("Signed visits are locked", 409);
  const b = await body<{ speaker?: string; text?: string; redacted?: boolean }>(req);
  if (b.speaker && !["clinician", "patient", "other"].includes(b.speaker)) return fail("Invalid speaker");
  const u = utterances.update(enc.id, uid, b);
  if (!u) return fail("Utterance not found", 404);
  if (b.redacted !== undefined) audit.log(user.id, enc.id, b.redacted ? "transcript.redacted" : "transcript.unredacted", { utterance: uid });
  return json({ utterance: u });
});
