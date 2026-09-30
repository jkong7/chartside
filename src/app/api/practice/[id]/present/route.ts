import { body, json } from "@/lib/server/http";
import { presentToAttending } from "@/lib/server/practice";
import { practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute<{ id: string }>("practice-grade", 120, async (req, actor, { id }) => {
  const b = await body<{ text?: string; seconds?: number }>(req);
  const r = await presentToAttending(id, actor, b);
  return json({ presentation: r.session.presentation, questions: r.questions });
});
