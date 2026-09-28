import { authed, body, json } from "@/lib/server/http";
import { addCare, completeCare, nursingView } from "@/lib/server/nursing";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ text?: string; done?: string }>(req);
  if (b.done) await completeCare(user, id, b.done);
  else await addCare(user, id, b.text ?? "");
  return json(await nursingView(user, id));
});
