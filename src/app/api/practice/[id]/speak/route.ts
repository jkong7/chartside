import { fail } from "@/lib/server/http";
import { getPractice, owns } from "@/lib/server/practice";
import { practiceRate, practiceRoute } from "@/lib/server/practiceHttp";
import { patientClip, VoiceBusy } from "@/lib/server/practiceVoice";
import { phoneSpeechReady } from "@/lib/server/telephony/speech";

export const GET = practiceRoute<{ id: string }>("practice-speak", practiceRate("CHARTSIDE_PRACTICE_TURN_RATE", 600), async (req, actor, { id }) => {
  if (!phoneSpeechReady()) return fail("Patient voice needs DEEPGRAM_API_KEY", 503);
  const s = await getPractice(id);
  if (!s || !owns(s, actor)) return fail("Practice session not found", 404);
  try {
    const audio = await patientClip(s, new URL(req.url).searchParams.get("turn") ?? "");
    if (!audio) return fail("Nothing to say", 404);
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/basic", "cache-control": "private, max-age=3600" } });
  } catch (err) {
    if (err instanceof VoiceBusy) return fail(err.message, 429);
    throw err;
  }
});
