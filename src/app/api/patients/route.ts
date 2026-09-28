import { assertCan } from "@/lib/server/policy";
import { authed, body, fail, json } from "@/lib/server/http";
import { patients } from "@/lib/server/repo";
import type { Chart, Patient } from "@/lib/types";

export const GET = authed(async (req, user) => {
  const url = new URL(req.url);
  if (url.searchParams.has("q") || url.searchParams.has("offset")) {
    const r = await patients.page(user, { q: url.searchParams.get("q") ?? "", offset: Number(url.searchParams.get("offset") ?? 0), limit: 50 });
    return json({ patients: r.rows, total: r.total });
  }
  return json({ patients: await patients.list(user) });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "patients.write");
  const b = await body<Partial<Patient>>(req);
  if (!b.name?.trim()) return fail("Name is required");
  if (!b.dob || Number.isNaN(Date.parse(b.dob))) return fail("Date of birth is required");
  const chart: Chart = { problems: [], medications: [], allergies: [], ...(b.chart ?? {}) };
  const p = await patients.create(user, {
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
