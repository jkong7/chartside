import { json } from "@/lib/server/http";
import { endPractice } from "@/lib/server/practice";
import { practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute<{ id: string }>("practice-turn", 600, async (_req, actor, { id }) => {
  const s = await endPractice(id, actor);
  return json({ status: s.status, grade: s.grade });
});
