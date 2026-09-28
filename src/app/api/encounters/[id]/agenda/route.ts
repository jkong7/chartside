import { agendaFor, toggleAgenda } from "@/lib/server/agenda";
import { authed, body, fail, json } from "@/lib/server/http";
import { encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  return json({ agenda: await agendaFor(user, enc) });
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ key?: string; done?: boolean }>(req);
  await toggleAgenda(user, id, b.key ?? "", b.done !== false);
  const enc = (await encounters.get(user, id))!;
  return json({ agenda: await agendaFor(user, enc) });
});
