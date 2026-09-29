import { seal, unseal } from "../../fhir/crypto";

export interface CallClaims {
  userId: string;
  orgId: string | null;
  phone: string;
  callSid: string;
  guest: boolean;
  sim: boolean;
  exp: number;
}

export function mintCallToken(c: Omit<CallClaims, "exp">, ttlSeconds = 120) {
  return seal(JSON.stringify({ ...c, exp: Date.now() + ttlSeconds * 1000 }));
}

export function readCallToken(token: string | null | undefined): CallClaims | null {
  if (!token) return null;
  try {
    const c = JSON.parse(unseal(token)) as CallClaims;
    if (!c.userId || !c.callSid || typeof c.exp !== "number" || c.exp < Date.now()) return null;
    return c;
  } catch {
    return null;
  }
}

const g = globalThis as unknown as { __chartsideStartedCalls?: Map<string, number> };
const started = (g.__chartsideStartedCalls ??= new Map());

export function claimCallStart(callSid: string, ttlMs = 15 * 60_000) {
  const t = Date.now();
  for (const [k, exp] of started) if (exp <= t) started.delete(k);
  if (started.has(callSid)) return false;
  started.set(callSid, t + ttlMs);
  return true;
}
