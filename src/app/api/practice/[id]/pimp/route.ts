import { body, json } from "@/lib/server/http";
import { answerPimp } from "@/lib/server/practice";
import { practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute<{ id: string }>("practice-grade", 120, async (req, actor, { id }) => {
  const b = await body<{ answers?: string[] }>(req);
  const s = await answerPimp(id, actor, b.answers);
  return json({ presentation: s.presentation });
});
