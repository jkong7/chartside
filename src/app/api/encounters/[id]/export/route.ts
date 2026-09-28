import { authed, fail, json } from "@/lib/server/http";
import { exportFhir, noteText } from "@/lib/server/pipeline";
import { documentText } from "@/lib/server/signoff";
import { audit, encounters, notes, patients } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const format = new URL(req.url).searchParams.get("format") ?? "text";
  if (format === "fhir") {
    return new Response(JSON.stringify(await exportFhir(user, enc.id), null, 2), { headers: { "content-type": "application/fhir+json", "content-disposition": `attachment; filename="chartside-${enc.id}.fhir.json"` } });
  }
  const rec = await notes.latest(enc.id);
  if (!rec) return fail("No note yet", 404);
  const p = enc.patientId ? await patients.get(user, enc.patientId) : undefined;
  await audit.log(user, enc.id, "export.text", {});
  return json({ text: `${p ? `${p.name} · MRN ${p.mrn} · DOB ${p.dob}\n` : ""}${new Date(enc.scheduledAt).toLocaleDateString("en-US")} · ${user.name}\n\n${enc.status === "signed" ? await documentText(enc.id, rec.content) : noteText(rec.content)}` });
});
