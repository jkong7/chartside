import { connections } from "@/lib/server/ehr";
import { authed, fail, json } from "@/lib/server/http";
import { audit } from "@/lib/server/repo";

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const c = await connections.get(user.id, id);
  if (!c) return fail("Connection not found", 404);
  await connections.remove(user.id, id);
  await audit.log(user, null, "ehr.disconnected", { iss: c.iss });
  return json({ ok: true });
});
