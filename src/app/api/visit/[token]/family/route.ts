import { json } from "@/lib/server/http";
import { shareWithFamily, stopFamilyShare, visitRoute } from "@/lib/server/patientVisit";

export const POST = visitRoute(async (req, v) => json(await shareWithFamily(v, new URL(req.url).origin), 201));

export const DELETE = visitRoute(async (_req, v) => {
  await stopFamilyShare(v);
  return json({ ok: true });
});
