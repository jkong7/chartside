import { NextResponse } from "next/server";
import { beginConsumer, ConsumerError } from "@/lib/server/consumer";
import { ssoRedirectUri } from "@/lib/server/sso";
import { newBinding, setBindingCookie } from "@/lib/server/oidcBinding";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (limited(`oauth:${clientIp(req)}`, Number(process.env.CHARTSIDE_AUTH_RATE ?? 30), 3600000)) return tooMany();
  const { provider } = await params;
  const url = new URL(req.url);
  try {
    const binding = newBinding();
    const to = await beginConsumer(provider, ssoRedirectUri(req), { next: url.searchParams.get("next"), hint: url.searchParams.get("hint"), browserHash: binding.hash });
    await setBindingCookie(binding.value);
    return NextResponse.redirect(to);
  } catch (err) {
    const back = new URL("/login", req.url);
    back.searchParams.set("error", err instanceof ConsumerError ? err.message : "That sign-in option is unavailable. Use your email instead.");
    return NextResponse.redirect(back);
  }
}
