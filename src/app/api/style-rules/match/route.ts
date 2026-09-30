import { authed, body, json } from "@/lib/server/http";
import { previewStyleMatch, saveStyleMatch } from "@/lib/server/styleMatch";

export const POST = authed(async (req, user) => {
  const b = await body<{ sample?: string; encounterId?: string; save?: boolean; apply?: boolean }>(req);
  if (b.save) {
    const r = await saveStyleMatch(user, b);
    return json({ findings: r.findings, rules: r.rules, before: r.before, after: r.after, applied: r.applied, saved: r.saved });
  }
  const r = await previewStyleMatch(user, b);
  return json({ findings: r.findings, rules: r.rules, before: r.before, after: r.after, encounterId: r.encounterId, signed: r.signed });
});
