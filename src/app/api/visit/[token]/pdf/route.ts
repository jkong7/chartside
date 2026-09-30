import { visitPdf, visitRoute } from "@/lib/server/patientVisit";

export const GET = visitRoute(async (_req, v) => new Response(new Uint8Array(await visitPdf(v)), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="visit-notes-${(v.recorded_at ?? v.created_at).slice(0, 10)}.pdf"`, "cache-control": "no-store" } }));
