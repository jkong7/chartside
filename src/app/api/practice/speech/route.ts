import { mintDeepgramToken, speechConfig } from "@/lib/server/audio";
import { body, fail, json } from "@/lib/server/http";
import { getPractice, owns } from "@/lib/server/practice";
import { practiceRate, practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute("practice-speech", practiceRate("CHARTSIDE_PRACTICE_SPEECH_RATE", 60), async (req, actor) => {
  const b = await body<{ session?: string; purpose?: string }>(req);
  const s = await getPractice(b.session ?? "");
  if (!s || !owns(s, actor)) return fail("Start a practice case first", 403);
  const cfg = speechConfig();
  if (!cfg.wsUrl) return json({ provider: "browser", url: null, token: null, voice: false });
  try {
    const { token } = await mintDeepgramToken(60);
    return json({ provider: "deepgram", url: `${cfg.wsUrl}&tag=chartside-practice${b.purpose === "note" || b.purpose === "present" ? `-${b.purpose}` : ""}`, token, voice: true });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Speech is unavailable", 503);
  }
});
