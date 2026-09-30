import { body, json } from "@/lib/server/http";
import { askPatient, elapsed } from "@/lib/server/practice";
import { practiceRate, practiceRoute } from "@/lib/server/practiceHttp";

export const POST = practiceRoute<{ id: string }>("practice-turn", practiceRate("CHARTSIDE_PRACTICE_TURN_RATE", 600), async (req, actor, { id }) => {
  const b = await body<{ text?: string; exam?: string }>(req);
  const r = await askPatient(id, actor, b);
  return json({ added: r.added, ended: r.ended, status: r.session.status, elapsed: elapsed(r.session) });
});
