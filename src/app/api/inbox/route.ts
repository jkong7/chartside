import { authed, json } from "@/lib/server/http";
import { inboxFor } from "@/lib/server/inbox";

export const GET = authed(async (_req, user) => json(await inboxFor(user)));
