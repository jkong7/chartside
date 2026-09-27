import { authed, body, fail, json } from "@/lib/server/http";
import { assertCan, can } from "@/lib/server/policy";
import { templates } from "@/lib/server/repo";
import type { SectionKind, Template } from "@/lib/types";

const KINDS: SectionKind[] = ["chief_complaint", "hpi", "ros", "pmh", "medications", "allergies", "social", "family", "vitals", "exam", "results", "assessment", "plan", "assessment_plan", "subjective", "objective", "mental_status", "patient_instructions", "follow_up", "custom"];

export const PUT = authed<{ id: string }>(async (req, user, { id }) => {
  const cur = await templates.get(user, id);
  if (!cur) return fail("Template not found", 404);
  const b = await body<Partial<Template> & { shared?: boolean }>(req);
  if (b.shared !== undefined && b.shared !== !!cur.shared) assertCan(user, "templates.share", "Only admins can share templates with the organization.");
  const sections = (b.sections ?? cur.sections).map((s, i) => ({
    key: (s.key || `s${i}`).replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
    title: s.title?.trim() || "Untitled",
    kind: KINDS.includes(s.kind) ? s.kind : "custom",
    format: s.format === "paragraph" ? "paragraph" : "bullets",
    instructions: s.instructions ?? "",
  })) as Template["sections"];
  if (new Set(sections.map((s) => s.key)).size !== sections.length) return fail("Section keys must be unique");
  return json({ template: await templates.save(user, { id, name: b.name?.trim() || cur.name, specialty: b.specialty ?? cur.specialty, description: b.description ?? cur.description, sections, style: b.style ?? cur.style, shared: b.shared }) });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  const cur = await templates.get(user, id);
  if (!cur || !cur.userId) return fail("Only your own templates can be deleted", 409);
  if (!cur.ownedByMe && !can(user, "templates.share")) return fail("Only the author or an admin can delete a shared template", 403);
  await templates.remove(user, id);
  return json({ ok: true });
});
