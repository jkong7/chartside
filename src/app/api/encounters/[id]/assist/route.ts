import { authed, body, fail, json } from "@/lib/server/http";
import { assist } from "@/lib/server/pipeline";
import { encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ message?: string }>(req);
  if (!b.message?.trim()) return fail("Ask a question or give an instruction");
  return json(await assist(user, enc.id, b.message.trim().slice(0, 1000)));
});
