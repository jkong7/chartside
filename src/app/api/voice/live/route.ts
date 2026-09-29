import { authed, json } from "@/lib/server/http";
import { liveCallsFor } from "@/lib/server/telephony/live";

export const GET = authed(async (_req, user) => json({ calls: liveCallsFor(user.id) }));
