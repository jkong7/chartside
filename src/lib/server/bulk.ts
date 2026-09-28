import { exportFhir } from "./pipeline";
import { Forbidden } from "./policy";
import { audit, encounters, patients, type User } from "./repo";

export function patientResource(p: { id: string; name: string; dob: string; sex: string; mrn: string; language: string; phone?: string | null; email?: string | null }) {
  const [given, ...rest] = p.name.split(/\s+/);
  return {
    resourceType: "Patient",
    id: p.id,
    identifier: [{ type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR" }] }, value: p.mrn }],
    name: [{ family: rest.join(" ") || given, given: rest.length ? [given] : [] }],
    gender: p.sex === "F" ? "female" : p.sex === "M" ? "male" : "unknown",
    birthDate: p.dob,
    communication: [{ language: { coding: [{ system: "urn:ietf:bcp:47", code: p.language }] } }],
    telecom: [...(p.phone ? [{ system: "phone", value: p.phone }] : []), ...(p.email ? [{ system: "email", value: p.email }] : [])],
  };
}

export async function bulkExport(u: User, opts: { since?: string } = {}) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only admins can export organization data");
  const encs = (await encounters.list(u, opts.since ? { from: opts.since } : {})).filter((e) => e.status === "signed" || e.status === "review");
  const pats = await patients.list(u);
  await audit.log(u, null, "data.exported", { encounters: encs.length, patients: pats.length, since: opts.since ?? null });
  const enc = new TextEncoder();
  let i = 0;
  const seen = new Set<string>();
  return new ReadableStream<Uint8Array>({
    async start(c) {
      for (const p of pats) c.enqueue(enc.encode(`${JSON.stringify(patientResource(p))}\n`));
    },
    async pull(c) {
      if (i >= encs.length) return c.close();
      const e = encs[i++];
      const bundle = (await exportFhir(u, e.id)) as { entry?: { resource: { resourceType: string; id?: string } }[] };
      for (const x of bundle.entry ?? []) {
        const key = `${x.resource.resourceType}/${x.resource.id ?? ""}`;
        if (x.resource.resourceType === "Patient" || (x.resource.id && seen.has(key))) continue;
        if (x.resource.id) seen.add(key);
        c.enqueue(enc.encode(`${JSON.stringify(x.resource)}\n`));
      }
    },
  });
}
