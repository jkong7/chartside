import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { get, now, run, uid } from "../db";
import { assertCan, Forbidden, Invalid } from "./policy";
import { audit, encounters, type User } from "./repo";

const TTL_MS = 5 * 60 * 1000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createPairing(u: User, encId: string, origin: string) {
  assertCan(u, "clinical.capture");
  const enc = await encounters.get(u, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") throw new Invalid("This visit is signed");
  const token = randomBytes(18).toString("base64url");
  const id = uid("pair_");
  await run("INSERT INTO device_pairings (id, org_id, user_id, encounter_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, u.orgId, u.id, encId, sha(token), new Date(Date.now() + TTL_MS).toISOString(), now());
  const url = `${origin.replace(/\/$/, "")}/pair/${token}`;
  await audit.log(u, encId, "pairing.created", { id });
  return { id, url, svg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }), expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
}

export async function redeemPairing(u: User, token: string, userAgent: string) {
  const r = await get<{ id: string; user_id: string; org_id: string; encounter_id: string; expires_at: string; used_at: string | null }>("SELECT * FROM device_pairings WHERE token_hash = ?", sha(token));
  if (!r || r.expires_at < now()) throw new Invalid("This code has expired. Show a new one on your computer.");
  if (r.used_at) throw new Invalid("This code was already used. Show a new one on your computer.");
  if (r.user_id !== u.id || r.org_id !== u.orgId) throw new Forbidden("Sign in on this phone as the same clinician who showed the code.");
  await run("UPDATE device_pairings SET used_at = ?, user_agent = ? WHERE id = ?", now(), userAgent.slice(0, 200), r.id);
  await audit.log(u, r.encounter_id, "pairing.redeemed", { id: r.id });
  return r.encounter_id;
}

export async function pairingStatus(u: User, id: string) {
  const r = await get<{ used_at: string | null; expires_at: string; encounter_id: string }>("SELECT used_at, expires_at, encounter_id FROM device_pairings WHERE id = ? AND user_id = ?", id, u.id);
  if (!r) throw new Error("Pairing not found");
  const enc = await encounters.get(u, r.encounter_id);
  return { connected: !!r.used_at, expired: !r.used_at && r.expires_at < now(), status: enc?.status ?? null };
}
