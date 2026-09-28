import { authed, body, json } from "@/lib/server/http";
import { researchDashboard, saveTrial } from "@/lib/server/trials";
import type { TrialCriteria } from "@/lib/engine/trials";

export const GET = authed(async (_req, user) => json({ trials: await researchDashboard(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ id?: string; title?: string; sponsor?: string; nct?: string; contact?: string; status?: string; criteria?: TrialCriteria }>(req);
  return json({ trial: await saveTrial(user, b) }, b.id ? 200 : 201);
});
