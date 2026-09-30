import { body, json } from "@/lib/server/http";
import { saveNotes, visitRoute } from "@/lib/server/patientVisit";

export const PUT = visitRoute(async (req, v) => json(await saveNotes(v, (await body<{ notes?: string }>(req)).notes)));
