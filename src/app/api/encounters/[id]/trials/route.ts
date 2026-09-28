import { authed, body, json } from "@/lib/server/http";
import { referToTrial, screenEncounter } from "@/lib/server/trials";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json({ matches: await screenEncounter(user, id) }));

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ trialId?: string }>(req);
  await referToTrial(user, id, b.trialId ?? "");
  return json({ matches: await screenEncounter(user, id) }, 201);
});
