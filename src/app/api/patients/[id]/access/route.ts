import { accessReport, reportCsv } from "@/lib/server/access";
import { authed, json } from "@/lib/server/http";
import { audit } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (req, user, { id }) => {
  const url = new URL(req.url);
  const r = await accessReport(user, id, Math.min(2190, Math.max(1, Number(url.searchParams.get("days") ?? 365))));
  await audit.log(user, null, "access_report.run", { patientId: id, format: url.searchParams.get("format") ?? "json" });
  if (url.searchParams.get("format") === "csv") return new Response(reportCsv(r), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="access-report-${r.patient.mrn}.csv"` } });
  return json(r);
});
