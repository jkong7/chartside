import { authed, json } from "@/lib/server/http";
import { createPairing } from "@/lib/server/pairing";

export const POST = authed<{ id: string }>(async (req, user, { id }) => json(await createPairing(user, id, new URL(req.url).origin), 201));
