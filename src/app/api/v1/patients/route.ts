import { apiHandler } from "@/lib/server/platform";
import { patientOut, patients } from "@/lib/server/apiv1";
import { Invalid } from "@/lib/server/policy";
import type { Chart } from "@/lib/types";

export const GET = apiHandler("patients:read", async (req, user) => {
  const mrn = new URL(req.url).searchParams.get("mrn");
  const list = (await patients.list(user)).filter((p) => !mrn || p.mrn === mrn);
  return { data: list.map(patientOut) };
});

export const POST = apiHandler("patients:write", async (req, user) => {
  const b = (await req.json().catch(() => ({}))) as { mrn?: string; name?: string; dob?: string; sex?: string; language?: string; chart?: Partial<Chart> };
  if (!b.mrn || !b.name || !/^\d{4}-\d{2}-\d{2}$/.test(b.dob ?? "") || !["F", "M", "X"].includes(b.sex ?? "")) throw new Invalid("mrn, name, dob (YYYY-MM-DD), and sex (F, M, or X) are required");
  if ((await patients.list(user)).some((p) => p.mrn === b.mrn)) throw new Invalid(`A patient with MRN ${b.mrn} already exists`);
  const p = await patients.create(user, { mrn: b.mrn, name: b.name, dob: b.dob!, sex: b.sex as "F", pronouns: "", language: b.language ?? "en", chart: { problems: b.chart?.problems ?? [], medications: b.chart?.medications ?? [], allergies: b.chart?.allergies ?? [], labs: b.chart?.labs, vitals: b.chart?.vitals } });
  return { data: patientOut(p) };
});
