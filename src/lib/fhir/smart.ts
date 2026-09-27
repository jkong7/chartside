export interface SmartConfig {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  capabilities?: string[];
  code_challenge_methods_supported?: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
  patient?: string;
  encounter?: string;
  fhirUser?: string;
  need_patient_banner?: boolean;
  [k: string]: unknown;
}

const JSON_ACCEPT = { Accept: "application/json" };

export function normalizeIss(iss: string) {
  return iss.trim().replace(/\/+$/, "");
}

export async function discover(iss: string): Promise<SmartConfig> {
  const base = normalizeIss(iss);
  const res = await fetch(`${base}/.well-known/smart-configuration`, { headers: JSON_ACCEPT });
  if (res.ok) {
    const j = (await res.json()) as SmartConfig;
    if (j.authorization_endpoint && j.token_endpoint) return j;
  }
  const meta = await fetch(`${base}/metadata`, { headers: { Accept: "application/fhir+json" } });
  if (!meta.ok) throw new Error(`Could not discover SMART endpoints for ${base}`);
  const cap = (await meta.json()) as { rest?: { security?: { extension?: { url: string; extension?: { url: string; valueUri?: string }[] }[] } }[] };
  const ext = cap.rest?.[0]?.security?.extension?.find((e) => /oauth-uris/.test(e.url))?.extension ?? [];
  const authorize = ext.find((e) => e.url === "authorize")?.valueUri;
  const token = ext.find((e) => e.url === "token")?.valueUri;
  if (!authorize || !token) throw new Error(`${base} does not advertise SMART on FHIR endpoints`);
  return { authorization_endpoint: authorize, token_endpoint: token };
}

export function authorizeUrl(cfg: SmartConfig, p: { clientId: string; redirectUri: string; scope: string; state: string; aud: string; challenge: string; launch?: string }) {
  const u = new URL(cfg.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", p.scope);
  u.searchParams.set("state", p.state);
  u.searchParams.set("aud", p.aud);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (p.launch) u.searchParams.set("launch", p.launch);
  return u.toString();
}

async function tokenRequest(tokenEndpoint: string, form: Record<string, string>, clientId: string, clientSecret?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", ...JSON_ACCEPT };
  const body = new URLSearchParams(form);
  if (clientSecret) headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
  else body.set("client_id", clientId);
  const res = await fetch(tokenEndpoint, { method: "POST", headers, body });
  const j = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Token request failed (${res.status}${j.error ? `: ${j.error_description ?? j.error}` : ""})`);
  return j;
}

export function exchangeCode(tokenEndpoint: string, p: { code: string; redirectUri: string; clientId: string; clientSecret?: string; verifier: string }) {
  return tokenRequest(tokenEndpoint, { grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri, code_verifier: p.verifier }, p.clientId, p.clientSecret);
}

export function refreshToken(tokenEndpoint: string, p: { refreshToken: string; clientId: string; clientSecret?: string }) {
  return tokenRequest(tokenEndpoint, { grant_type: "refresh_token", refresh_token: p.refreshToken }, p.clientId, p.clientSecret);
}

export class FhirError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function fhirRequest<T = unknown>(base: string, token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ data: T; location: string | null; status: number }> {
  const res = await fetch(`${normalizeIss(base)}/${path.replace(/^\//, "")}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/fhir+json", ...(init.body ? { "Content-Type": "application/fhir+json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  if (!res.ok) {
    const issue = (data as { issue?: { diagnostics?: string; details?: { text?: string } }[] } | null)?.issue?.[0];
    throw new FhirError(`FHIR ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})${issue ? `: ${issue.diagnostics ?? issue.details?.text ?? ""}` : ""}`, res.status);
  }
  return { data, location: res.headers.get("location") ?? res.headers.get("content-location"), status: res.status };
}

export function idTokenClaims(idToken?: string): Record<string, unknown> {
  if (!idToken) return {};
  const part = idToken.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function fhirUserOf(t: TokenResponse) {
  if (typeof t.fhirUser === "string") return t.fhirUser;
  const claim = idTokenClaims(t.id_token).fhirUser ?? idTokenClaims(t.id_token).profile;
  return typeof claim === "string" ? claim : null;
}
