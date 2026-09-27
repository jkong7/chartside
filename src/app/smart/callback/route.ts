import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { completeLaunch } from "@/lib/server/ehr";
import { errorPage } from "@/lib/server/smartRoutes";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const error = url.searchParams.get("error");
  if (error) return errorPage(req, `The EHR declined authorization: ${url.searchParams.get("error_description") ?? error}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return errorPage(req, "The EHR returned without an authorization code.");
  try {
    const r = await completeLaunch(user, state, code);
    if (r.encounterId) return NextResponse.redirect(new URL(`/encounters/${r.encounterId}`, req.url));
    const s = new URL("/settings", req.url);
    s.searchParams.set("ehr_connected", "1");
    return NextResponse.redirect(s);
  } catch (err) {
    return errorPage(req, err instanceof Error ? err.message : "The EHR launch failed");
  }
}
