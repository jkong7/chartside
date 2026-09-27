import type { Claim, ClaimDx } from "@/lib/engine/billing";
import { claimStatus } from "@/lib/engine/billing";
import type { PaPacket } from "@/lib/engine/priorauth";
import { authed, body, fail, json } from "@/lib/server/http";
import { revalidate, sanitizeLines } from "@/lib/server/revenue";
import { artifacts, claims, encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  return json({ record: await claims.get(enc.id) ?? null, draft: await artifacts.get<Claim>(enc.id, "claim") ?? null, priorAuth: await artifacts.get<PaPacket[]>(enc.id, "priorAuth") ?? [] });
});

export const PUT = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const rec = await claims.get(enc.id);
  if (!rec) return fail("Claims are created when the note is signed", 409);
  if (rec.status === "submitted") return fail("Submitted claims cannot be edited", 409);
  const b = await body<{ lines?: Claim["lines"]; dx?: ClaimDx[] }>(req);
  const dx = (b.dx ?? rec.content.dx).slice(0, 12).map((d, i) => ({ pointer: "ABCDEFGHIJKL"[i], code: String(d.code).trim().toUpperCase().slice(0, 8), label: String(d.label ?? "").slice(0, 120) }));
  const claim = await revalidate(user, enc.id, { ...rec.content, dx, lines: sanitizeLines(b.lines ?? rec.content.lines) });
  const status = claimStatus(claim);
  return json({ record: await claims.save(user.id, enc.id, status, claim, [...rec.history, { at: new Date().toISOString(), action: "edited" }]) });
});
