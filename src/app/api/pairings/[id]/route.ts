import { authed, json } from "@/lib/server/http";
import { pairingStatus } from "@/lib/server/pairing";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json(await pairingStatus(user, id)));
