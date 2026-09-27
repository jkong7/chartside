import type { PaPacket } from "@/lib/engine/priorauth";
import { authed, body, fail, json } from "@/lib/server/http";
import { artifacts, audit, encounters } from "@/lib/server/repo";

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const b = await body<{ packetId?: string; submission?: PaPacket["submission"] }>(req);
  if (!b.packetId || !["draft", "submitted", "approved", "denied"].includes(b.submission ?? "")) return fail("packetId and a valid submission status are required");
  const packets = artifacts.get<PaPacket[]>(enc.id, "priorAuth") ?? [];
  if (!packets.some((p) => p.id === b.packetId)) return fail("Packet not found", 404);
  const next = packets.map((p) => (p.id === b.packetId ? { ...p, submission: b.submission! } : p));
  artifacts.set(enc.id, "priorAuth", next);
  audit.log(user.id, enc.id, `prior_auth.${b.submission}`, { service: packets.find((p) => p.id === b.packetId)!.service });
  return json({ priorAuth: next });
});
