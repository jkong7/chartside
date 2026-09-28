import { sessionToken } from "@/lib/server/auth";
import { authed, json } from "@/lib/server/http";
import { listSessions, signOutEverywhere } from "@/lib/server/security";

export const GET = authed(async (_req, user) => json({ sessions: await listSessions(user, await sessionToken()) }));

export const DELETE = authed(async (_req, user) => {
  const keep = await sessionToken();
  await signOutEverywhere(user, keep);
  return json({ sessions: await listSessions(user, keep) });
});
