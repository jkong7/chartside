import { body, fail, json } from "@/lib/server/http";
import { beginSso, SsoError, ssoOrgForEmail, ssoRedirectUri } from "@/lib/server/sso";
import { OidcError } from "@/lib/sso/oidc";
import { newBinding, setBindingCookie } from "@/lib/server/oidcBinding";

export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email") ?? "";
  const org = await ssoOrgForEmail(email);
  return json(org ? { sso: true, required: !!org.settings.sso?.requireSso, orgName: org.name } : { sso: false, required: false, orgName: null });
}

export async function POST(req: Request) {
  const b = await body<{ email?: string; next?: string }>(req);
  try {
    const binding = newBinding();
    const url = await beginSso({ email: b.email, next: b.next }, ssoRedirectUri(req), binding.hash);
    await setBindingCookie(binding.value);
    return json({ url });
  } catch (err) {
    if (err instanceof SsoError || err instanceof OidcError) return fail(err.message, 422);
    throw err;
  }
}
