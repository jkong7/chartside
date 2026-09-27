import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { startLaunch } from "./ehr";

export function redirectUri(req: Request) {
  return process.env.SMART_REDIRECT_URI || `${new URL(req.url).origin}/smart/callback`;
}

export function errorPage(req: Request, message: string) {
  const u = new URL("/settings", req.url);
  u.searchParams.set("ehr_error", message.slice(0, 300));
  return NextResponse.redirect(u);
}

export async function beginLaunch(req: Request, iss: string | null, launch: string | null) {
  const user = await currentUser();
  const url = new URL(req.url);
  if (!user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", `${url.pathname}${url.search}`);
    return NextResponse.redirect(login);
  }
  if (!iss) return errorPage(req, "The EHR did not send an iss (FHIR server) parameter.");
  try {
    return NextResponse.redirect(await startLaunch(user, { iss, launch: launch ?? undefined, redirectUri: redirectUri(req) }));
  } catch (err) {
    return errorPage(req, err instanceof Error ? err.message : "Could not start the EHR launch");
  }
}
