import { growthState } from "@/lib/server/growth";
import { authed, json } from "@/lib/server/http";

export const GET = authed(async (req, user) => json(await growthState(user, new URL(req.url).origin)));
