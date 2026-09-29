import { captureNote, captureRoute } from "@/lib/server/capture";
import { json } from "@/lib/server/http";

export const GET = captureRoute<{ id: string }>(async (_req, auth, { id }) => json(await captureNote(auth, id)));
