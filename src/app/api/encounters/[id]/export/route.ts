import { authed, fail, json } from "@/lib/server/http";
import { exportFhir, noteText } from "@/lib/server/pipeline";
import { audit, encounters, notes, patients } from "@/lib/server/repo";

export const GET = authed<{ id: string }>((req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  const format = new URL(req.url).searchParams.get("format") ?? "text";
  if (format === "fhir") {
    return new Response(JSON.stringify(exportFhir(user, enc.id), null, 2), { headers: { "content-type": "application/fhir+json", "content-disposition": `attachment; filename="chartside-${enc.id}.fhir.json"` } });
  }
  const rec = notes.latest(enc.id);
  if (!rec) return fail("No note yet", 404);
  const p = enc.patientId ? patients.get(user.id, enc.patientId) : undefined;
  audit.log(user.id, enc.id, "export.text", {});
  return json({ text: `${p ? `${p.name} · MRN ${p.mrn} · DOB ${p.dob}\n` : ""}${new Date(enc.scheduledAt).toLocaleDateString("en-US")} · ${user.name}\n\n${noteText(rec.content)}` });
});
