import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizationUrl, decodeJwt, pkce, validateClaims, verifySignature, type Jwk } from "@/lib/sso/oidc";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaJwk = { ...(rsa.publicKey.export({ format: "jwk" }) as Jwk), kid: "r1", use: "sig", alg: "RS256" };
const ecJwk = { ...(ec.publicKey.export({ format: "jwk" }) as Jwk), kid: "e1", use: "sig", alg: "ES256" };
const KEYS = [rsaJwk, ecJwk];

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const t = Math.floor(Date.now() / 1000);
const base = { iss: "https://idp.test", aud: "chartside", sub: "u-1", iat: t, exp: t + 300, nonce: "n-1", email: "avery@lakeside.test", email_verified: true };
const opts = { issuer: "https://idp.test", clientId: "chartside", nonce: "n-1" };

function jwt(claims: object, header: object, key: KeyObject | null, ecdsa = false) {
  const signed = `${b64(header)}.${b64(claims)}`;
  const sig = key ? sign("sha256", Buffer.from(signed), ecdsa ? { key, dsaEncoding: "ieee-p1363" } : key).toString("base64url") : "";
  return `${signed}.${sig}`;
}

describe("OIDC ID token verification", () => {
  it("accepts RS256 and ES256 tokens signed by the provider", () => {
    const rs = jwt(base, { alg: "RS256", kid: "r1" }, rsa.privateKey);
    expect(validateClaims(verifySignature(rs, KEYS), opts).email).toBe("avery@lakeside.test");
    const es = jwt(base, { alg: "ES256", kid: "e1" }, ec.privateKey, true);
    expect(validateClaims(verifySignature(es, KEYS), opts).sub).toBe("u-1");
  });

  it("rejects forged, tampered, unsigned, and unknown-key tokens", () => {
    expect(() => verifySignature(jwt(base, { alg: "RS256", kid: "r1" }, other.privateKey), KEYS)).toThrow("signature is invalid");
    const good = jwt(base, { alg: "RS256", kid: "r1" }, rsa.privateKey).split(".");
    const tampered = `${good[0]}.${b64({ ...base, email: "attacker@evil.test" })}.${good[2]}`;
    expect(() => verifySignature(tampered, KEYS)).toThrow("signature is invalid");
    expect(() => verifySignature(jwt(base, { alg: "none" }, null), KEYS)).toThrow("Unsupported ID token algorithm none");
    expect(() => verifySignature(jwt(base, { alg: "HS256", kid: "r1" }, null), KEYS)).toThrow("Unsupported");
    expect(() => verifySignature(jwt(base, { alg: "RS256", kid: "missing" }, rsa.privateKey), KEYS)).toThrow("No signing key");
    expect(() => verifySignature(jwt(base, { alg: "ES256", kid: "r1" }, ec.privateKey, true), KEYS)).toThrow("No signing key");
    expect(() => decodeJwt("not-a-jwt")).toThrow("Malformed");
  });

  it("enforces issuer, audience, expiry, nonce, and subject", () => {
    expect(() => validateClaims({ ...base, iss: "https://evil.test" }, opts)).toThrow("different provider");
    expect(() => validateClaims({ ...base, aud: "other" }, opts)).toThrow("different application");
    expect(validateClaims({ ...base, aud: ["chartside", "api"], azp: "chartside" }, opts).sub).toBe("u-1");
    expect(() => validateClaims({ ...base, aud: ["api", "chartside"], azp: "api" }, opts)).toThrow("authorized party");
    expect(() => validateClaims({ ...base, exp: t - 600 }, opts)).toThrow("expired");
    expect(validateClaims({ ...base, exp: t - 60 }, opts).sub).toBe("u-1");
    expect(() => validateClaims({ ...base, iat: t + 3600 }, opts)).toThrow("future");
    expect(() => validateClaims({ ...base, nonce: "replayed" }, opts)).toThrow("nonce");
    expect(() => validateClaims({ ...base, nonce: undefined }, opts)).toThrow("nonce");
    expect(() => validateClaims({ ...base, sub: "" }, opts)).toThrow("subject");
    expect(validateClaims({ ...base, iss: "https://idp.test/" }, opts).sub).toBe("u-1");
  });

  it("builds a PKCE authorization request with nonce and login hint", () => {
    const { verifier, challenge } = pkce();
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
    const u = new URL(authorizationUrl({ issuer: "https://idp.test", authorization_endpoint: "https://idp.test/authorize", token_endpoint: "https://idp.test/token", jwks_uri: "https://idp.test/jwks" }, { clientId: "chartside", redirectUri: "https://app/sso/callback", state: "s", nonce: "n", challenge, loginHint: "a@b.test" }));
    expect(Object.fromEntries(u.searchParams)).toEqual({ response_type: "code", client_id: "chartside", redirect_uri: "https://app/sso/callback", scope: "openid email profile", state: "s", nonce: "n", code_challenge: challenge, code_challenge_method: "S256", login_hint: "a@b.test" });
  });
});
