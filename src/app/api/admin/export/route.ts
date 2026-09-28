import { bulkExport } from "@/lib/server/bulk";
import { authed } from "@/lib/server/http";

export const GET = authed(async (req, user) => {
  const since = new URL(req.url).searchParams.get("since") ?? undefined;
  const stream = await bulkExport(user, { since: since && /^\d{4}-\d{2}-\d{2}/.test(since) ? since : undefined });
  return new Response(stream, { headers: { "content-type": "application/fhir+ndjson", "content-disposition": `attachment; filename="chartside-export-${new Date().toISOString().slice(0, 10)}.ndjson"` } });
});
