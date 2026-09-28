import { monthExport } from "@/lib/server/ccm";
import { authed } from "@/lib/server/http";

export const GET = authed(async (req, user) => {
  const month = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  return new Response(await monthExport(user, month), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="ccm-${month}.csv"` } });
});
