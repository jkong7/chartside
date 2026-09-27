import type { PaPacket } from "@/lib/engine/priorauth";
import { can, Forbidden } from "@/lib/server/policy";
import { authed, body, fail, json } from "@/lib/server/http";
import { artifacts, audit, encounters } from "@/lib/server/repo";

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  if (!can(user, "clinical.edit") && !can(user, "billing.review")) throw new Forbidden("Your role can't update prior authorizations.");
  const b = await body<{ packetId?: string; submission?: PaPacket["submission"] }>(req);
  if (!b.packetId || !["draft", "submitted", "approved", "denied"].includes(b.submission ?? "")) return fail("packetId and a valid submission status are required");
  const packets = await artifacts.get<PaPacket[]>(enc.id, "priorAuth") ?? [];
  if (!packets.some((p) => p.id === b.packetId)) return fail("Packet not found", 404);
  const next = packets.map((p) => (p.id === b.packetId ? { ...p, submission: b.submission! } : p));
  await artifacts.set(enc.id, "priorAuth", next);
  await audit.log(user, enc.id, `prior_auth.${b.submission}`, { service: packets.find((p) => p.id === b.packetId)!.service });
  return json({ priorAuth: next });
});
