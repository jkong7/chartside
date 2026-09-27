import { authed, body, fail, json } from "@/lib/server/http";
import { encounters, notes, patients } from "@/lib/server/repo";
import type { Chart } from "@/lib/types";

export const GET = authed<{ id: string }>((_req, user, { id }) => {
  const p = patients.get(user.id, id);
  if (!p) return fail("Patient not found", 404);
  const visits = encounters.list(user.id, { patientId: id }).map((e) => ({ ...e, noteStatus: notes.latest(e.id)?.status ?? null }));
  return json({ patient: p, encounters: visits });
});

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const p = patients.get(user.id, id);
  if (!p) return fail("Patient not found", 404);
  const b = await body<{ chart?: Partial<Chart> }>(req);
  patients.updateChart(user.id, id, { ...p.chart, ...(b.chart ?? {}) });
  return json({ patient: patients.get(user.id, id) });
});
