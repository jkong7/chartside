import { connections } from "@/lib/server/ehr";
import { authed, fail, json } from "@/lib/server/http";
import { audit } from "@/lib/server/repo";

export const DELETE = authed<{ id: string }>((_req, user, { id }) => {
  const c = connections.get(user.id, id);
  if (!c) return fail("Connection not found", 404);
  connections.remove(user.id, id);
  audit.log(user.id, null, "ehr.disconnected", { iss: c.iss });
  return json({ ok: true });
});
