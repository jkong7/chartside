import { authed, json } from "@/lib/server/http";
import { computeInsights } from "@/lib/server/insights";
import { styleRules } from "@/lib/server/repo";

export const GET = authed((req, user) => {
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days") ?? 30)));
  return json({ insights: computeInsights(user.id, days), rules: styleRules.list(user.id) });
});
