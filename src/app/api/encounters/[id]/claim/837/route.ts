import { to837 } from "@/lib/engine/billing";
import { authed, fail } from "@/lib/server/http";
import { claims, encounters, patients } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const rec = await claims.get(enc.id);
  if (!rec) return fail("No claim yet", 404);
  const p = enc.patientId ? await patients.get(user, enc.patientId) : undefined;
  const text = to837(rec.content, {
    claimId: `CS${enc.id.slice(-10).toUpperCase()}`,
    patient: { name: p?.name ?? "UNKNOWN PATIENT", dob: p?.dob ?? "1900-01-01", sex: p?.sex ?? "X", mrn: p?.mrn ?? "0" },
    provider: { name: user.name, npi: "1234567893" },
    date: enc.scheduledAt.slice(0, 10),
  });
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="claim-${enc.id}.837p.txt"` } });
});
