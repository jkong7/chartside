import { authed, json } from "@/lib/server/http";
import { revenueSummary } from "@/lib/server/revenue";

export const GET = authed((_req, user) => json(revenueSummary(user)));
