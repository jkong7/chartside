import { body, json } from "@/lib/server/http";
import { saveVisit, visitRoute } from "@/lib/server/patientVisit";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export const POST = visitRoute(async (req, v, token) => {
  if (limited(`visit-save:${clientIp(req)}`, Number(process.env.CHARTSIDE_VISIT_RATE ?? 10), 3600000)) return tooMany();
  return json(await saveVisit(v, (await body<{ contact?: string }>(req)).contact, token, new URL(req.url).origin));
});
