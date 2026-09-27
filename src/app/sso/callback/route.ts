import { NextResponse } from "next/server";
import { startSession } from "@/lib/server/auth";
import { completeSso, SsoError, ssoRedirectUri } from "@/lib/server/sso";

function toLogin(req: Request, message: string) {
  const u = new URL("/login", req.url);
  u.searchParams.set("error", message.slice(0, 300));
  return NextResponse.redirect(u);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) return toLogin(req, url.searchParams.get("error_description") ?? `Your identity provider returned "${error}".`);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return toLogin(req, "The sign-in response was incomplete. Start again.");
  try {
    const { user, next } = await completeSso(state, code, ssoRedirectUri(req));
    await startSession(user.id, user.orgId);
    return NextResponse.redirect(new URL(next ?? "/today", req.url));
  } catch (err) {
    if (err instanceof SsoError) return toLogin(req, err.message);
    console.error(err);
    return toLogin(req, "Single sign-on failed. Try again or contact your administrator.");
  }
}
