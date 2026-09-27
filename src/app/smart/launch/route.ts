import { beginLaunch, errorPage } from "@/lib/server/smartRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const launch = url.searchParams.get("launch");
  if (!launch) return errorPage(req, "An EHR launch needs a launch parameter. Use Connect from Settings for a standalone connection.");
  return beginLaunch(req, url.searchParams.get("iss"), launch);
}
