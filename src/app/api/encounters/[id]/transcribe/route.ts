import { finalPass } from "@/lib/server/audio";
import { authed, fail, json } from "@/lib/server/http";
import { encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  if (enc.status === "signed") return fail("Signed visits are locked", 409);
  const out = await finalPass(user, enc);
  if (!out.ran) return fail(out.reason === "no-provider" ? "Set DEEPGRAM_API_KEY to enable high-accuracy re-transcription." : out.reason === "no-audio" ? "No audio was recorded for this visit." : "The recording contained no speech.", 409);
  return json(out);
});
