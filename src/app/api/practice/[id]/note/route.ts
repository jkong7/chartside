import { body, json } from "@/lib/server/http";
import { submitNote } from "@/lib/server/practice";
import { practiceRate, practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute<{ id: string }>("practice-grade", practiceRate("CHARTSIDE_PRACTICE_RATE", 30) * 2, async (req, actor, { id }) => {
  const b = await body<{ note?: string }>(req);
  const s = await submitNote(id, actor, b.note ?? "");
  return json({ id: s.id, status: s.status, score: s.score });
});
