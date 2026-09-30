import { json } from "@/lib/server/http";
import { deleteVisit, refreshVisit, visitRoute, visitView } from "@/lib/server/patientVisit";

export const GET = visitRoute(async (req, v) => json(await visitView(await refreshVisit(v), new URL(req.url).origin), { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } }));

export const DELETE = visitRoute(async (_req, v) => json(await deleteVisit(v)));
