import { seal, unseal } from "../../fhir/crypto";
import { run } from "../../db";
import { hashPassword } from "../auth";
import { hasPhonePin, pinProblem } from "../magic";
import { audit, users } from "../repo";

const TTL_MS = 15 * 60_000;

export function pinOfferToken(userId: string, phone: string, pin: string) {
  const problem = pinProblem(pin);
  if (problem) throw new Error(problem);
  return seal(JSON.stringify({ userId, phone, pinHash: hashPassword(pin), exp: Date.now() + TTL_MS }));
}

export function readPinOffer(token: string | null | undefined) {
  try {
    const t = JSON.parse(unseal(token ?? "")) as { userId: string; phone: string; pinHash: string; exp: number };
    if (!t.userId || !t.pinHash || t.exp < Date.now()) return null;
    return t;
  } catch {
    return null;
  }
}

export async function confirmPinOffer(token: string) {
  const t = readPinOffer(token);
  if (!t) return { ok: false as const, reason: "This link expired. Set your PIN on your next call, or in Chartside settings." };
  const u = await users.byId(t.userId);
  if (!u || !u.phone || u.phone !== t.phone) return { ok: false as const, reason: "This link doesn't match your verified phone anymore." };
  if (await hasPhonePin(t.userId)) return { ok: false as const, reason: "You already have a phone PIN. Change it in Chartside settings." };
  await run("UPDATE users SET phone_pin_hash = ?, phone_pin_failures = 0, phone_pin_locked_until = NULL WHERE id = ?", t.pinHash, t.userId);
  await audit.log({ id: t.userId, orgId: null }, null, "phone.pin_set", { via: "call" });
  return { ok: true as const };
}
