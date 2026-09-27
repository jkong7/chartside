import { authed, json } from "@/lib/server/http";
import { revenueSummary } from "@/lib/server/revenue";

export const GET = authed(async (_req, user) => json({ claims: (await revenueSummary(user)).rows }));
