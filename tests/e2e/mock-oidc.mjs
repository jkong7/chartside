import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_OIDC_PORT || 3296);
const ISSUER = `http://localhost:${PORT}`;
const CLIENT = "chartside-sso";
const SECRET = "idp-secret";
const KID = "mock-key-1";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "RS256" };
const rogue = createPrivateKey(generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }));

const codes = new Map();
const people = new Map();
const stats = { authorize: 0, token: 0 };
let mode = "normal";

const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

function idToken(claims, key = privateKey) {
  const head = b64({ alg: "RS256", typ: "JWT", kid: KID });
  const body = b64(claims);
  return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), key).toString("base64url")}`;
}

function person(email) {
  const known = people.get(email);
  if (known) return known;
  const local = email.split("@")[0];
  const name = local.split(/[._-]/).map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
  return { sub: `okta|${createHash("sha256").update(email).digest("hex").slice(0, 16)}`, email, name: `Dr. ${name}`, email_verified: true };
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let s = "";
  for await (const c of req) s += c;
  return s;
}

createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);
  if (url.pathname === "/.well-known/openid-configuration") {
    return send(res, 200, { issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"] });
  }
  if (url.pathname === "/jwks") return send(res, 200, { keys: [jwk] });
  if (url.pathname === "/stats") return send(res, 200, stats);
  if (url.pathname === "/mode" && req.method === "POST") {
    mode = JSON.parse(await readBody(req)).mode ?? "normal";
    return send(res, 200, { mode });
  }
  if (url.pathname === "/people" && req.method === "POST") {
    const p = JSON.parse(await readBody(req));
    people.set(p.email, { ...person(p.email), ...p });
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/authorize") {
    stats.authorize++;
    const q = url.searchParams;
    const redirect = new URL(q.get("redirect_uri"));
    if (q.get("client_id") !== CLIENT || q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !q.get("nonce") || !q.get("scope")?.split(" ").includes("openid")) {
      redirect.searchParams.set("error", "invalid_request");
      redirect.searchParams.set("state", q.get("state") ?? "");
      res.writeHead(302, { location: redirect.toString() });
      return res.end();
    }
    if (mode === "deny") {
      redirect.searchParams.set("error", "access_denied");
      redirect.searchParams.set("error_description", "The user is not assigned to this application.");
      redirect.searchParams.set("state", q.get("state"));
      res.writeHead(302, { location: redirect.toString() });
      return res.end();
    }
    const code = randomBytes(16).toString("hex");
    codes.set(code, { redirectUri: q.get("redirect_uri"), challenge: q.get("code_challenge"), nonce: q.get("nonce"), who: person(q.get("login_hint") || "someone@lakeside.test") });
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", q.get("state"));
    res.writeHead(302, { location: redirect.toString() });
    return res.end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    stats.token++;
    const form = new URLSearchParams(await readBody(req));
    const auth = req.headers.authorization ?? "";
    const [id, secret] = Buffer.from(auth.replace(/^Basic /, ""), "base64").toString().split(":").map(decodeURIComponent);
    if (id !== CLIENT || secret !== SECRET) return send(res, 401, { error: "invalid_client" });
    const c = codes.get(form.get("code"));
    codes.delete(form.get("code"));
    if (!c) return send(res, 400, { error: "invalid_grant" });
    if (form.get("redirect_uri") !== c.redirectUri) return send(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
    if (createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") !== c.challenge) return send(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
    const t = Math.floor(Date.now() / 1000);
    const claims = { iss: ISSUER, aud: CLIENT, sub: c.who.sub, iat: t, exp: t + 300, nonce: c.nonce, email: c.who.email, email_verified: c.who.email_verified, name: c.who.name };
    if (mode === "bad-nonce") claims.nonce = "attacker";
    if (mode === "wrong-aud") claims.aud = "other-app";
    const token = mode === "bad-signature" ? idToken(claims, rogue) : idToken(claims);
    return send(res, 200, { access_token: randomBytes(16).toString("hex"), token_type: "Bearer", expires_in: 300, id_token: token });
  }
  send(res, 404, { error: "not_found" });
}).listen(PORT, () => console.log(`mock oidc on ${PORT}`));
