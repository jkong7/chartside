import { authed, json } from "@/lib/server/http";
import { inboxCount } from "@/lib/server/inbox";

export const GET = authed(async (_req, user) => json({ count: await inboxCount(user) }));
