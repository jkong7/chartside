import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";

export interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
}

export interface Jwk {
  kty: string;
  kid?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  alg?: string;
  use?: string;
}

export interface IdClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  azp?: string;
}

const metaCache = new Map<string, { at: number; meta: OidcMetadata }>();
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();
const TTL = 10 * 60 * 1000;

export class OidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcError";
  }
}

export async function discoverOidc(issuer: string): Promise<OidcMetadata> {
  const iss = issuer.replace(/\/+$/, "");
  const hit = metaCache.get(iss);
  if (hit && Date.now() - hit.at < TTL) return hit.meta;
  let res: Response;
  try {
    res = await fetch(`${iss}/.well-known/openid-configuration`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new OidcError(`Could not reach ${iss}. Check the issuer URL.`);
  }
  if (!res.ok) throw new OidcError(`${iss} did not return OpenID configuration (HTTP ${res.status})`);
  const meta = (await res.json()) as OidcMetadata;
  if (meta.issuer?.replace(/\/+$/, "") !== iss) throw new OidcError("The provider's issuer does not match the configured issuer");
  for (const k of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) if (!meta[k]) throw new OidcError(`The provider's configuration is missing ${k}`);
  metaCache.set(iss, { at: Date.now(), meta });
  return meta;
}

async function jwks(uri: string, fresh = false): Promise<Jwk[]> {
  const hit = jwksCache.get(uri);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.keys;
  const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new OidcError(`Could not load signing keys (HTTP ${res.status})`);
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  jwksCache.set(uri, { at: Date.now(), keys });
  return keys;
}

export function clearOidcCache() {
  metaCache.clear();
  jwksCache.clear();
}

const b64 = (s: string) => Buffer.from(s, "base64url");

export function decodeJwt(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new OidcError("Malformed ID token");
  try {
    return { header: JSON.parse(b64(parts[0]).toString("utf8")) as { alg: string; kid?: string; typ?: string }, claims: JSON.parse(b64(parts[1]).toString("utf8")) as IdClaims, signed: `${parts[0]}.${parts[1]}`, signature: b64(parts[2]) };
  } catch {
    throw new OidcError("Malformed ID token");
  }
}

const ALGS: Record<string, { hash: string; kty: string; ec?: boolean; pss?: boolean }> = {
  RS256: { hash: "sha256", kty: "RSA" },
  RS384: { hash: "sha384", kty: "RSA" },
  RS512: { hash: "sha512", kty: "RSA" },
  PS256: { hash: "sha256", kty: "RSA", pss: true },
  ES256: { hash: "sha256", kty: "EC", ec: true },
  ES384: { hash: "sha384", kty: "EC", ec: true },
};

export function verifySignature(token: string, keys: Jwk[]) {
  const { header, claims, signed, signature } = decodeJwt(token);
  const alg = ALGS[header.alg];
  if (!alg) throw new OidcError(`Unsupported ID token algorithm ${header.alg}`);
  const candidates = keys.filter((k) => k.kty === alg.kty && (!header.kid || k.kid === header.kid) && (!k.use || k.use === "sig") && (!k.alg || k.alg === header.alg));
  if (!candidates.length) throw new OidcError("No signing key matches the ID token");
  const ok = candidates.some((jwk) => {
    try {
      const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" });
      return verify(alg.hash, Buffer.from(signed), alg.ec ? { key, dsaEncoding: "ieee-p1363" } : alg.pss ? { key, padding: 6, saltLength: 32 } : key, signature);
    } catch {
      return false;
    }
  });
  if (!ok) throw new OidcError("ID token signature is invalid");
  return claims;
}

export function validateClaims(claims: IdClaims, opts: { issuer: string; clientId: string; nonce: string; now?: number; skew?: number }) {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const skew = opts.skew ?? 120;
  if (claims.iss?.replace(/\/+$/, "") !== opts.issuer.replace(/\/+$/, "")) throw new OidcError("ID token was issued by a different provider");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.clientId)) throw new OidcError("ID token was issued for a different application");
  if (aud.length > 1 && claims.azp && claims.azp !== opts.clientId) throw new OidcError("ID token authorized party mismatch");
  if (typeof claims.exp !== "number" || claims.exp + skew < now) throw new OidcError("ID token has expired");
  if (typeof claims.iat === "number" && claims.iat - skew > now) throw new OidcError("ID token was issued in the future");
  if (!claims.nonce || claims.nonce !== opts.nonce) throw new OidcError("ID token nonce mismatch");
  if (!claims.sub) throw new OidcError("ID token has no subject");
  return claims;
}

export async function verifyIdToken(token: string, opts: { issuer: string; clientId: string; nonce: string; jwksUri: string; now?: number }) {
  const { header } = decodeJwt(token);
  let keys = await jwks(opts.jwksUri);
  if (header.kid && !keys.some((k) => k.kid === header.kid)) keys = await jwks(opts.jwksUri, true);
  return validateClaims(verifySignature(token, keys), opts);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function pkce() {
  const verifier = randomToken(48);
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizationUrl(meta: OidcMetadata, p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; loginHint?: string }) {
  const u = new URL(meta.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", p.state);
  u.searchParams.set("nonce", p.nonce);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (p.loginHint) u.searchParams.set("login_hint", p.loginHint);
  return u.toString();
}

export async function exchangeCode(meta: OidcMetadata, p: { clientId: string; clientSecret?: string; code: string; redirectUri: string; verifier: string }) {
  const form = new URLSearchParams({ grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri, code_verifier: p.verifier, client_id: p.clientId });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (p.clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(p.clientId)}:${encodeURIComponent(p.clientSecret)}`).toString("base64")}`;
  const res = await fetch(meta.token_endpoint, { method: "POST", headers, body: form, signal: AbortSignal.timeout(10000) });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.id_token) throw new OidcError(data.error_description ?? data.error ?? `Token exchange failed (HTTP ${res.status})`);
  return data.id_token;
}
