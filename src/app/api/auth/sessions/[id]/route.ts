import { sessionToken } from "@/lib/server/auth";
import { authed, json } from "@/lib/server/http";
import { listSessions, revokeSession } from "@/lib/server/security";

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await revokeSession(user, id);
  return json({ sessions: await listSessions(user, await sessionToken()) });
});
