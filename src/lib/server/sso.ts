import { get, now, run } from "../db";
import { markEmailProven } from "./emailProof";
import { unseal } from "../fhir/crypto";
import { authorizationUrl, discoverOidc, exchangeCode, OidcError, pkce, randomToken, verifyIdToken } from "../sso/oidc";
import { actorFor, audit, orgs, users, type Org, type User } from "./repo";

const LOGIN_TTL_MS = 10 * 60 * 1000;

export class SsoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsoError";
  }
}

export function ssoRedirectUri(req: Request) {
  return process.env.SSO_REDIRECT_URI || `${new URL(req.url).origin}/sso/callback`;
}

function domainOf(email: string) {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export async function ssoOrgForEmail(email: string) {
  const d = domainOf(email);
  return d ? orgs.forDomain(d) : undefined;
}

export async function beginSso(input: { email?: string; orgSlug?: string; next?: string | null }, redirectUri: string) {
  let org: Org | undefined;
  if (input.email) org = await ssoOrgForEmail(input.email);
  if (!org) throw new SsoError("Single sign-on isn't set up for that email domain. Sign in with your password or ask your administrator.");
  const sso = org.settings.sso!;
  const meta = await discoverOidc(sso.issuer);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const { verifier, challenge } = pkce();
  const next = input.next && input.next.startsWith("/") && !input.next.startsWith("//") ? input.next : null;
  await run("DELETE FROM oidc_logins WHERE created_at < ?", new Date(Date.now() - LOGIN_TTL_MS).toISOString());
  await run("INSERT INTO oidc_logins (state, org_id, verifier, nonce, next, created_at) VALUES (?, ?, ?, ?, ?, ?)", state, org.id, verifier, nonce, next, now());
  return authorizationUrl(meta, { clientId: sso.clientId, redirectUri, state, nonce, challenge, loginHint: input.email });
}

export async function completeSso(state: string, code: string, redirectUri: string): Promise<{ user: User; next: string | null; created: boolean }> {
  const login = await get<{ org_id: string; verifier: string; nonce: string; next: string | null; created_at: string }>("SELECT * FROM oidc_logins WHERE state = ?", state);
  await run("DELETE FROM oidc_logins WHERE state = ?", state);
  if (!login || Date.now() - new Date(login.created_at).getTime() > LOGIN_TTL_MS) throw new SsoError("This sign-in attempt expired. Start again.");
  const org = await orgs.get(login.org_id);
  const sso = org?.settings.sso;
  if (!org || !sso?.enabled) throw new SsoError("Single sign-on is no longer enabled for this organization.");
  const meta = await discoverOidc(sso.issuer);
  let claims;
  try {
    const idToken = await exchangeCode(meta, { clientId: sso.clientId, clientSecret: sso.clientSecret ? unseal(sso.clientSecret) : undefined, code, redirectUri, verifier: login.verifier });
    claims = await verifyIdToken(idToken, { issuer: sso.issuer, clientId: sso.clientId, nonce: login.nonce, jwksUri: meta.jwks_uri });
  } catch (err) {
    await audit.log({ id: null, orgId: org.id }, null, "sso.rejected", { reason: err instanceof Error ? err.message : "unknown" });
    throw new SsoError(err instanceof OidcError ? err.message : "Your identity provider did not complete sign-in.");
  }
  const email = (claims.email ?? "").toLowerCase();
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!email || !verified) throw new SsoError("Your identity provider did not share a verified email address.");
  if (!sso.domains.includes(domainOf(email))) {
    await audit.log({ id: null, orgId: org.id }, null, "sso.rejected", { reason: "domain", email });
    throw new SsoError(`${email} isn't in a domain managed by ${org.name}.`);
  }

  const link = await get<{ user_id: string }>("SELECT user_id FROM sso_identities WHERE issuer = ? AND subject = ?", sso.issuer, claims.sub);
  let userId = link?.user_id;
  let created = false;
  if (!userId) {
    const existing = await users.byEmail(email);
    if (existing) userId = existing.id;
    else {
      if (!sso.jit) throw new SsoError(`No Chartside account exists for ${email}. Ask your administrator for an invitation.`);
      const name = claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || email.split("@")[0];
      userId = (await users.create({ email, name, passwordHash: "", specialty: "Family Medicine" })).id;
      created = true;
    }
    await run("INSERT INTO sso_identities (issuer, subject, org_id, user_id, email, last_login_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", sso.issuer, claims.sub, org.id, userId, email, now(), now());
  } else {
    await run("UPDATE sso_identities SET last_login_at = ?, email = ? WHERE issuer = ? AND subject = ?", now(), email, sso.issuer, claims.sub);
  }
  await markEmailProven(userId, "sso");

  const membership = await orgs.membership(org.id, userId);
  if (membership?.status === "disabled") throw new SsoError(`Your access to ${org.name} has been disabled. Contact your administrator.`);
  if (!membership) {
    if (!sso.jit) throw new SsoError(`You aren't a member of ${org.name}. Ask your administrator for an invitation.`);
    try {
      await (await import("./plan")).assertSeat(org.id, sso.defaultRole);
    } catch {
      throw new SsoError(`${org.name} has no clinician seats left. Ask your administrator to add seats.`);
    }
    await orgs.addMember(org.id, userId, sso.defaultRole);
    await audit.log({ id: userId, orgId: org.id }, null, "member.provisioned", { via: "sso", role: sso.defaultRole, email });
  }
  const user = (await actorFor(userId, org.id))!;
  await audit.log(user, null, "user.login", { method: "sso", issuer: sso.issuer });
  return { user, next: login.next, created };
}
