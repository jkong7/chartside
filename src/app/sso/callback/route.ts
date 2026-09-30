import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser, endSession, startSession } from "@/lib/server/auth";
import { completeConsumer, ConsumerError, isConsumerState } from "@/lib/server/consumer";
import { attributeReferral, REF_COOKIE } from "@/lib/server/growth";
import { recordSignup, touchFromCookies } from "@/lib/server/loops";
import { mfaStatus } from "@/lib/server/security";
import { completeSso, SsoError, ssoRedirectUri } from "@/lib/server/sso";
import { browserTz } from "@/lib/server/tz";

function toLogin(req: Request, message: string) {
  const u = new URL("/login", req.url);
  u.searchParams.set("error", message.slice(0, 300));
  return NextResponse.redirect(u);
}

async function consumer(req: Request, state: string, code: string) {
  const current = await currentUser();
  const { user, next, created } = await completeConsumer(state, code, ssoRedirectUri(req), { current, tz: await browserTz() });
  if ((await mfaStatus(user.id)).enabled) return toLogin(req, "This account uses two-step verification. Sign in with your password or an email code.");
  if (current && current.id !== user.id) await endSession();
  if (created) {
    await attributeReferral(user.id, (await cookies()).get(REF_COOKIE)?.value);
    await recordSignup(user.id, await touchFromCookies(await cookies()));
  }
  await startSession(user.id, user.orgId);
  return NextResponse.redirect(new URL(next, req.url));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) return toLogin(req, url.searchParams.get("error_description") ?? `Your identity provider returned "${error}".`);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return toLogin(req, "The sign-in response was incomplete. Start again.");
  try {
    if (await isConsumerState(state)) return await consumer(req, state, code);
    const { user, next } = await completeSso(state, code, ssoRedirectUri(req));
    await startSession(user.id, user.orgId);
    return NextResponse.redirect(new URL(next ?? "/today", req.url));
  } catch (err) {
    if (err instanceof SsoError || err instanceof ConsumerError) return toLogin(req, err.message);
    console.error(err);
    return toLogin(req, "Sign-in failed. Try again or use your email.");
  }
}
