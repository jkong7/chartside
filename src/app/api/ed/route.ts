import { arrive, edBoard } from "@/lib/server/ed";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed(async (_req, user) => json(await edBoard(user)));

export const POST = authed(async (req, user) => {
  const b = await body<{ patientId?: string; name?: string; dob?: string; sex?: string; complaint?: string; esi?: number; bed?: string }>(req);
  return json({ visit: await arrive(user, b) }, 201);
});
