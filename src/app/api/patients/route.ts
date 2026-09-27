import { authed, body, fail, json } from "@/lib/server/http";
import { patients } from "@/lib/server/repo";
import type { Chart, Patient } from "@/lib/types";

export const GET = authed((_req, user) => json({ patients: patients.list(user.id) }));

export const POST = authed(async (req, user) => {
  const b = await body<Partial<Patient>>(req);
  if (!b.name?.trim()) return fail("Name is required");
  if (!b.dob || Number.isNaN(Date.parse(b.dob))) return fail("Date of birth is required");
  const chart: Chart = { problems: [], medications: [], allergies: [], ...(b.chart ?? {}) };
  const p = patients.create(user.id, {
    mrn: b.mrn?.trim() || String(100000 + Math.floor(Math.random() * 899999)),
    name: b.name.trim(),
    dob: b.dob,
    sex: (b.sex as Patient["sex"]) ?? "X",
    pronouns: b.pronouns ?? "",
    language: b.language ?? "en",
    chart,
  });
  return json({ patient: p }, 201);
});
