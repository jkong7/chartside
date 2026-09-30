import { readCaptureRequest } from "@/lib/server/capture";
import { json } from "@/lib/server/http";
import { appendVisitAudio, visitRoute } from "@/lib/server/patientVisit";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export const POST = visitRoute(async (req, v) => {
  if (limited(`visit-audio:${clientIp(req)}`, Number(process.env.CHARTSIDE_VISIT_UPLOAD_RATE ?? 2000), 3600000)) return tooMany();
  return json(await appendVisitAudio(v, await readCaptureRequest(req)), 202);
});
