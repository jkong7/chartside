import { fail, json } from "@/lib/server/http";
import { elapsed, getPractice, owns, publicCard } from "@/lib/server/practice";
import { practiceRoute } from "@/lib/server/practiceHttp";

export const GET = practiceRoute<{ id: string }>("practice-read", 600, async (_req, actor, { id }) => {
  const s = await getPractice(id);
  if (!s) return fail("Practice session not found", 404);
  if (!owns(s, actor)) return json({ card: publicCard(s) });
  return json({ card: publicCard(s), session: { ...s, device: undefined, userId: undefined, elapsed: elapsed(s) } });
});
