import { fail } from "@/lib/server/http";
import { practiceCase } from "@/lib/engine/practice/cases";
import { getPractice, owns, patientVoice } from "@/lib/server/practice";
import { practiceRate, practiceRoute } from "@/lib/server/practiceHttp";
import { phoneSpeechReady, synthesize } from "@/lib/server/telephony/speech";

export const GET = practiceRoute<{ id: string }>("practice-speak", practiceRate("CHARTSIDE_PRACTICE_TURN_RATE", 600), async (req, actor, { id }) => {
  if (!phoneSpeechReady()) return fail("Patient voice needs DEEPGRAM_API_KEY", 503);
  const s = await getPractice(id);
  if (!s || !owns(s, actor)) return fail("Practice session not found", 404);
  const turn = s.turns.find((t) => t.id === new URL(req.url).searchParams.get("turn") && t.role === "patient");
  if (!turn) return fail("Nothing to say", 404);
  const audio = await synthesize(turn.text.slice(0, 600), undefined, "en", patientVoice(practiceCase(s.caseId)!));
  return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/basic", "cache-control": "private, max-age=3600" } });
});
