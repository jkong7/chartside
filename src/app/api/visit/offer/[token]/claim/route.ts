import { cookies } from "next/headers";
import { authed, json } from "@/lib/server/http";
import { CLAIM_COOKIE, claimOffer } from "@/lib/server/patientVisit";

export const POST = authed<{ token: string }>(async (_req, user, { token }) => {
  const jar = await cookies();
  const r = await claimOffer(user, token, { cookie: jar.get(CLAIM_COOKIE)?.value });
  jar.delete(CLAIM_COOKIE);
  return json(r, 201);
});
