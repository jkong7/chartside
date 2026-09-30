import { body, json } from "@/lib/server/http";
import { recordVisitConsent, visitRoute } from "@/lib/server/patientVisit";

export const POST = visitRoute(async (req, v) => {
  const b = await body<{ decision?: string; clinicianName?: string; clinicianContact?: string; othersPresent?: boolean; allPartiesConfirmed?: boolean }>(req);
  return json({ status: (await recordVisitConsent(v, b)) === "granted" ? "recording" : "declined" }, 201);
});
