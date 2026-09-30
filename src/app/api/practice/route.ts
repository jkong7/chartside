import { body, json } from "@/lib/server/http";
import { historyFor, publicCard, startPractice } from "@/lib/server/practice";
import { practiceRate, practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute(
  "practice",
  practiceRate("CHARTSIDE_PRACTICE_RATE", 30),
  async (req, actor) => {
    const b = await body<{ caseId?: string; name?: string; cohort?: string; minutes?: number; challenge?: string }>(req);
    const s = await startPractice({ caseId: b.caseId ?? "", actor, name: b.name, cohort: b.cohort, minutes: b.minutes, challengeOf: b.challenge ?? null, channel: "web" });
    return json({ id: s.id, timeLimitS: s.timeLimitS, startedAt: s.startedAt }, 201);
  },
  { create: true },
);

export const GET = practiceRoute("practice-read", 600, async (_req, actor) => json({ sessions: (await historyFor(actor)).map(publicCard) }));
