import { assertCan, can } from "@/lib/server/policy";
import { authed, body, fail, json } from "@/lib/server/http";
import { encounters, notes, patients } from "@/lib/server/repo";
import type { Chart } from "@/lib/types";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const p = await patients.get(user, id);
  if (!p) return fail("Patient not found", 404);
  const visits = await Promise.all((await encounters.list(user, { patientId: id })).map(async (e) => ({ ...e, noteStatus: (await notes.latest(e.id))?.status ?? null })));
  return json({ patient: p, encounters: visits });
});

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const p = await patients.get(user, id);
  if (!p) return fail("Patient not found", 404);
  const b = await body<{ chart?: Partial<Chart> }>(req);
  const coverageOnly = !!b.chart && Object.keys(b.chart).every((k) => k === "coverage");
  if (!(coverageOnly && can(user, "billing.review"))) assertCan(user, "patients.write");
  const next = { ...p.chart, ...(b.chart ?? {}) };
  if (b.chart && "animal" in b.chart) next.animal = p.chart.animal || b.chart.animal ? { ...(b.chart.animal ?? p.chart.animal!), ownerPhone: p.chart.animal?.ownerPhone ?? null, ownerPhoneConfirmedAt: p.chart.animal?.ownerPhoneConfirmedAt ?? null } : undefined;
  if (b.chart && "pregnancy" in b.chart) {
    const g = b.chart.pregnancy;
    if (!g) delete next.pregnancy;
    else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(g.edd ?? "") || Number.isNaN(Date.parse(g.edd))) return fail("Enter the estimated due date", 422);
      const days = (Date.parse(g.edd) - Date.now()) / 86400000;
      if (days < -60 || days > 300) return fail("That due date doesn't fit a current pregnancy", 422);
      next.pregnancy = { edd: g.edd, gravida: Number.isInteger(g.gravida) ? g.gravida : undefined, para: Number.isInteger(g.para) ? g.para : undefined, rh: g.rh === "negative" || g.rh === "positive" ? g.rh : undefined };
    }
  }
  await patients.updateChart(user, id, next);
  return json({ patient: await patients.get(user, id) });
});
