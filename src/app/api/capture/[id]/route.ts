import { appendCapture, captureRoute, captureStatus, readCaptureRequest } from "@/lib/server/capture";
import { json } from "@/lib/server/http";

export const GET = captureRoute<{ id: string }>(async (_req, auth, { id }) => json(await captureStatus(auth, id)));

export const POST = captureRoute<{ id: string }>(async (req, auth, { id }) => json(await appendCapture(auth, id, await readCaptureRequest(req)), 202));
