import { apiHandler } from "@/lib/server/platform";
import { claims, encounters } from "@/lib/server/repo";

export const GET = apiHandler<{ encounterId: string }>("claims:read", async (_req, user, { encounterId }) => {
  const e = await encounters.get(user, encounterId);
  const c = e ? await claims.get(e.id) : undefined;
  if (!c) throw new Error("Claim not found");
  return { data: { encounterId: e!.id, status: c.status, placeOfService: c.content.placeOfService, payer: c.content.payer, diagnoses: c.content.dx, lines: c.content.lines.map((l) => ({ cpt: l.cpt, modifiers: l.modifiers, units: l.units, charge: l.charge, pointers: l.pointers })), edits: c.content.edits.map((x) => ({ severity: x.severity, rule: x.rule, message: x.message })), totals: c.content.totals, history: c.history } };
});
