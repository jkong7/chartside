import { authed, body, fail, json } from "@/lib/server/http";
import { templates } from "@/lib/server/repo";
import type { Template } from "@/lib/types";

export const GET = authed(async (_req, user) => json({ templates: await templates.list(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<Partial<Template> & { duplicateOf?: string }>(req);
  if (b.duplicateOf) {
    const src = await templates.get(user, b.duplicateOf);
    if (!src) return fail("Template not found", 404);
    return json({ template: await templates.save(user, { name: `${src.name} (copy)`, specialty: src.specialty, description: src.description, sections: src.sections, style: src.style }) }, 201);
  }
  if (!b.name?.trim()) return fail("Template name is required");
  if (!b.sections?.length) return fail("Add at least one section");
  return json({ template: await templates.save(user, { name: b.name.trim(), specialty: b.specialty ?? "General", description: b.description ?? "", sections: b.sections, style: b.style ?? {} }) }, 201);
});
