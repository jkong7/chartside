import { get, now, run } from "../db";
import { bindingMatches } from "./oidcBinding";
import { markEmailProven } from "./emailProof";
import { authorizationUrl, decodeJwt, discoverOidc, exchangeCode, OidcError, pkce, randomToken, verifyIdToken } from "../sso/oidc";
import { convertGuest, mergeGuest } from "./guest";
import { safePath } from "./magic";
import { actorFor, audit, orgs, users, type User } from "./repo";
import { setupNewAccount } from "./signup";

export type ConsumerProvider = "google" | "microsoft";

const LOGIN_TTL_MS = 10 * 60 * 1000;
const PREFIX = "provider:";
const LABEL: Record<ConsumerProvider, string> = { google: "Google", microsoft: "Microsoft" };
const DEFAULT_ISSUER: Record<ConsumerProvider, string> = { google: "https://accounts.google.com", microsoft: "https://login.microsoftonline.com/common/v2.0" };

export class ConsumerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsumerError";
  }
}

export function consumerConfig(p: ConsumerProvider) {
  const key = p.toUpperCase();
  const clientId = process.env[`CHARTSIDE_${key}_CLIENT_ID`];
  if (!clientId) return null;
  return { provider: p, label: LABEL[p], clientId, clientSecret: process.env[`CHARTSIDE_${key}_CLIENT_SECRET`] || undefined, issuer: (process.env[`CHARTSIDE_${key}_ISSUER`] || DEFAULT_ISSUER[p]).replace(/\/+$/, "") };
}

export function consumerProviders() {
  return (["google", "microsoft"] as const).filter((p) => !!consumerConfig(p)).map((p) => ({ id: p, label: LABEL[p] }));
}

const isProvider = (p: string): p is ConsumerProvider => p === "google" || p === "microsoft";
const tenantTemplate = (issuer: string) => /\/(common|organizations|consumers)\/v2\.0$/.test(issuer);

async function metadata(cfg: NonNullable<ReturnType<typeof consumerConfig>>) {
  if (!tenantTemplate(cfg.issuer)) return discoverOidc(cfg.issuer);
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) throw new ConsumerError(`${cfg.label} sign-in is unavailable right now. Use your email instead.`);
  return (await res.json()) as Awaited<ReturnType<typeof discoverOidc>>;
}

export async function beginConsumer(provider: string, redirectUri: string, opts: { next?: string | null; hint?: string | null; browserHash: string }) {
  if (!isProvider(provider)) throw new ConsumerError("Unknown sign-in provider");
  const cfg = consumerConfig(provider);
  if (!cfg) throw new ConsumerError(`${LABEL[provider]} sign-in isn't set up here. Use your email instead.`);
  const meta = await metadata(cfg);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const { verifier, challenge } = pkce();
  await run("DELETE FROM oidc_logins WHERE created_at < ?", new Date(Date.now() - LOGIN_TTL_MS).toISOString());
  await run("INSERT INTO oidc_logins (state, org_id, verifier, nonce, next, created_at, browser) VALUES (?, ?, ?, ?, ?, ?, ?)", state, `${PREFIX}${provider}`, verifier, nonce, opts.next ? safePath(opts.next, "/go") : null, now(), opts.browserHash);
  const hint = opts.hint && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.hint) ? opts.hint : undefined;
  const url = new URL(authorizationUrl(meta, { clientId: cfg.clientId, redirectUri, state, nonce, challenge, loginHint: hint }));
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function isConsumerState(state: string) {
  const r = await get<{ org_id: string }>("SELECT org_id FROM oidc_logins WHERE state = ?", state);
  return !!r?.org_id.startsWith(PREFIX);
}

export async function completeConsumer(state: string, code: string, redirectUri: string, ctx: { current: User | null; tz?: string | null; browser: string | null }): Promise<{ user: User; next: string; created: boolean }> {
  const login = await get<{ org_id: string; verifier: string; nonce: string; next: string | null; created_at: string; browser: string | null }>("SELECT * FROM oidc_logins WHERE state = ?", state);
  await run("DELETE FROM oidc_logins WHERE state = ?", state);
  if (!login || !login.org_id.startsWith(PREFIX) || Date.now() - new Date(login.created_at).getTime() > LOGIN_TTL_MS) throw new ConsumerError("This sign-in attempt expired. Start again.");
  if (!bindingMatches(login.browser, ctx.browser)) throw new ConsumerError("This sign-in didn't start in this browser. Start again here.");
  const provider = login.org_id.slice(PREFIX.length);
  if (!isProvider(provider)) throw new ConsumerError("Unknown sign-in provider");
  const cfg = consumerConfig(provider);
  if (!cfg) throw new ConsumerError(`${LABEL[provider]} sign-in isn't set up here.`);
  const meta = await metadata(cfg);
  let claims;
  try {
    const idToken = await exchangeCode(meta, { clientId: cfg.clientId, clientSecret: cfg.clientSecret, code, redirectUri, verifier: login.verifier });
    const tid = (decodeJwt(idToken).claims as { tid?: string }).tid;
    const issuer = meta.issuer.includes("{tenantid}") ? meta.issuer.replace("{tenantid}", tid ?? "") : meta.issuer;
    claims = await verifyIdToken(idToken, { issuer, clientId: cfg.clientId, nonce: login.nonce, jwksUri: meta.jwks_uri });
  } catch (err) {
    await audit.log(null, null, "consumer.rejected", { provider, reason: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    throw new ConsumerError(err instanceof OidcError ? `${cfg.label} sign-in failed: ${err.message}` : `${cfg.label} did not finish signing you in. Try again or use your email.`);
  }
  const email = (claims.email ?? "").toLowerCase().trim();
  const extra = claims as { xms_edov?: boolean | string };
  const verified = claims.email_verified === true || claims.email_verified === "true" || extra.xms_edov === true || extra.xms_edov === "true";
  if (!email || !verified) throw new ConsumerError(`${cfg.label} didn't share a verified email. Use your email to sign up instead.`);
  const sso = await orgs.requiringSso(email.split("@")[1] ?? "");
  if (sso) throw new ConsumerError(`${sso.name} signs in with single sign-on. Use Sign in with SSO.`);
  const issuerKey = `${PREFIX}${provider}`;
  const linked = await get<{ user_id: string }>("SELECT user_id FROM sso_identities WHERE issuer = ? AND subject = ?", issuerKey, claims.sub);
  const current = ctx.current;
  const guestId = current?.guestUntil ? current.id : null;
  let userId = linked?.user_id;
  let created = false;
  if (!userId) {
    const existing = await users.byEmail(email);
    if (existing) {
      userId = existing.id;
      if (guestId && guestId !== existing.id) await mergeGuest(guestId, existing.id);
    } else if (guestId) {
      userId = await convertGuest(guestId, email);
      created = true;
    } else {
      const name = claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || email.split("@")[0];
      userId = (await users.create({ email, name, passwordHash: "", specialty: "Family Medicine" })).id;
      await orgs.create(`${name}'s practice`, userId);
      created = true;
    }
    const actor = await actorFor(userId);
    if (!actor) throw new ConsumerError("Your access to Chartside has been disabled. Contact your administrator.");
    await run("INSERT INTO sso_identities (issuer, subject, org_id, user_id, email, last_login_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", issuerKey, claims.sub, actor.orgId, userId, email, now(), now());
  } else {
    await run("UPDATE sso_identities SET last_login_at = ?, email = ? WHERE issuer = ? AND subject = ?", now(), email, issuerKey, claims.sub);
    if (guestId && guestId !== userId) await mergeGuest(guestId, userId);
  }
  await markEmailProven(userId, provider);
  if (created) {
    const name = claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || undefined;
    await setupNewAccount(userId, { name, tz: ctx.tz ?? undefined });
  }
  const user = await actorFor(userId);
  if (!user) throw new ConsumerError("Your access to Chartside has been disabled. Contact your administrator.");
  await audit.log(user, null, created ? "user.registered" : "user.login", { method: provider });
  return { user, next: login.next ?? (created ? "/go?welcome=1" : "/go"), created };
}
