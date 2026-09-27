import { ehrConfig } from "@/lib/server/ehr";
import { beginLaunch } from "@/lib/server/smartRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return beginLaunch(req, url.searchParams.get("iss") || ehrConfig().defaultIss, null);
}
