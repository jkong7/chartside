import { authed, body, fail, json } from "@/lib/server/http";
import { styleRules } from "@/lib/server/repo";
import type { StyleRule } from "@/lib/types";

export const GET = authed((_req, user) => json({ rules: styleRules.list(user.id) }));

export const POST = authed(async (req, user) => {
  const b = await body<Partial<StyleRule>>(req);
  const kinds = ["max_words", "abbreviate", "drop_phrase", "always_include"];
  if (!b.kind || !kinds.includes(b.kind)) return fail("Choose a rule type");
  if (!b.value?.trim()) return fail("Rule value is required");
  const section = b.section?.trim() || "*";
  const label =
    b.kind === "max_words" ? `Keep ${section} under ${b.value} words` : b.kind === "abbreviate" ? "Use standard clinical abbreviations" : b.kind === "drop_phrase" ? `Omit lines starting "${b.value}"` : `Always add "${b.value}"`;
  styleRules.addManual(user.id, { kind: b.kind as StyleRule["kind"], section, value: b.kind === "drop_phrase" ? b.value.trim().toLowerCase() : b.value.trim(), label: b.label?.trim() || label });
  return json({ rules: styleRules.list(user.id) }, 201);
});
