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
  await patients.updateChart(user, id, { ...p.chart, ...(b.chart ?? {}) });
  return json({ patient: await patients.get(user, id) });
});
