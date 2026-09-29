import { captureRoute, readCaptureRequest, startCapture } from "@/lib/server/capture";
import { json } from "@/lib/server/http";

export const POST = captureRoute(async (req, auth) => json(await startCapture(auth, await readCaptureRequest(req)), 202));
