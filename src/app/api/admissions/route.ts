import { authed, body, json } from "@/lib/server/http";
import { admit, census } from "@/lib/server/inpatient";

export const GET = authed(async (_req, user) => json({ census: await census(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ patientId?: string; unit?: string; room?: string; reason?: string; attendingId?: string }>(req);
  return json(await admit(user, b), 201);
});
