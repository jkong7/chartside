import { json } from "@/lib/server/http";
import { retryVisit, visitRoute } from "@/lib/server/patientVisit";

export const POST = visitRoute(async (_req, v) => json(await retryVisit(v), 202));
