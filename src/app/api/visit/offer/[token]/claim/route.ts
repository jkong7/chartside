import { authed, json } from "@/lib/server/http";
import { claimOffer } from "@/lib/server/patientVisit";

export const POST = authed<{ token: string }>(async (_req, user, { token }) => json(await claimOffer(user, token), 201));
