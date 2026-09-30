import { setOwnerPhone } from "@/lib/server/barn";
import { authed, body, json } from "@/lib/server/http";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ phone?: string | null; confirm?: boolean }>(req);
  return json({ animal: await setOwnerPhone(user, id, { phone: b.phone ?? null, confirm: b.confirm === true }) });
});
