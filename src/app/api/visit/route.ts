import { body, json } from "@/lib/server/http";
import { createVisit, visitError } from "@/lib/server/patientVisit";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  if (limited(`visit:${clientIp(req)}`, Number(process.env.CHARTSIDE_VISIT_RATE ?? 10), 3600000)) return tooMany();
  try {
    const b = await body<{ patientName?: string; state?: string }>(req);
    return json(await createVisit({ patientName: b.patientName, state: b.state, ipKey: clientIp(req) === "local" ? null : clientIp(req).slice(0, 8) }), 201);
  } catch (err) {
    return visitError(err);
  }
}
