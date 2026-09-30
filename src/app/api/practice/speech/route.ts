import { body, fail, json } from "@/lib/server/http";
import { getPractice, owns } from "@/lib/server/practice";
import { practiceRate, practiceRoute } from "@/lib/server/practiceHttp";
import { grantSpeech, speechPurpose } from "@/lib/server/practiceSpeech";

export const POST = practiceRoute("practice-speech", practiceRate("CHARTSIDE_PRACTICE_SPEECH_RATE", 60), async (req, actor) => {
  const b = await body<{ session?: string; purpose?: string }>(req);
  const s = await getPractice(b.session ?? "");
  if (!s || !owns(s, actor)) return fail("Start a practice case first", 403);
  return json(await grantSpeech(s, speechPurpose(b.purpose)));
});
