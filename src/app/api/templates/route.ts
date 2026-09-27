import { authed, body, fail, json } from "@/lib/server/http";
import { templates } from "@/lib/server/repo";
import type { Template } from "@/lib/types";

export const GET = authed((_req, user) => json({ templates: templates.list(user.id) }));

export const POST = authed(async (req, user) => {
  const b = await body<Partial<Template> & { duplicateOf?: string }>(req);
  if (b.duplicateOf) {
    const src = templates.get(user.id, b.duplicateOf);
    if (!src) return fail("Template not found", 404);
    return json({ template: templates.save(user.id, { name: `${src.name} (copy)`, specialty: src.specialty, description: src.description, sections: src.sections, style: src.style }) }, 201);
  }
  if (!b.name?.trim()) return fail("Template name is required");
  if (!b.sections?.length) return fail("Add at least one section");
  return json({ template: templates.save(user.id, { name: b.name.trim(), specialty: b.specialty ?? "General", description: b.description ?? "", sections: b.sections, style: b.style ?? {} }) }, 201);
});
