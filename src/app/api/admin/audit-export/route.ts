import { auditCsv } from "@/lib/server/compliance";
import { authed } from "@/lib/server/http";

export const GET = authed(async (req, user) => {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return new Response(await auditCsv(user, from, to), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="audit-${from}-to-${to}.csv"` } });
});
