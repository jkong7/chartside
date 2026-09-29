import { claimNpi, lookupNpi } from "@/lib/server/growth";
import { assertNotGuest } from "@/lib/server/guest";
import { authed, body, fail, json } from "@/lib/server/http";

export const GET = authed(async (req) => {
  const rec = await lookupNpi(new URL(req.url).searchParams.get("npi") ?? "");
  return rec ? json(rec) : fail("No individual clinician has that NPI", 404);
});

export const POST = authed(async (req, user) => {
  assertNotGuest(user, "add your NPI");
  const b = await body<{ npi?: string; state?: string; applyName?: boolean }>(req);
  return json(await claimNpi(user, b));
});
