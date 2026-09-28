import { authed, body, json } from "@/lib/server/http";
import { assertCan, Invalid } from "@/lib/server/policy";
import { recordContact } from "@/lib/server/tcm";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  assertCan(user, "clinical.edit");
  const b = await body<{ outcome?: string }>(req);
  if (b.outcome !== "reached" && b.outcome !== "attempt") throw new Invalid("Choose reached or attempt");
  return json({ episode: await recordContact(user, id, b.outcome) });
});
