import { authed, body, fail, json } from "@/lib/server/http";
import { addAddendum, verifyChain } from "@/lib/server/signoff";
import { addenda, encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  return json({ addenda: await addenda.list(enc.id), chain: await verifyChain(enc.id) });
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ kind?: string; text?: string; reason?: string }>(req);
  const addendum = await addAddendum(user, id, b);
  return json({ addendum, addenda: await addenda.list(id), chain: await verifyChain(id) }, 201);
});
