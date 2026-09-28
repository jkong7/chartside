import { authed, body, json } from "@/lib/server/http";
import { queueReview, reviews, RUBRIC, setPolicy, trustMetrics } from "@/lib/server/qa";

export const GET = authed(async (_req, user) => json({ reviews: await reviews(user), metrics: await trustMetrics(user), rubric: RUBRIC }));

export const POST = authed(async (req, user) => {
  const b = await body<{ encounterId?: string; samplePct?: number; newUserDays?: number }>(req);
  if (b.encounterId) return json({ id: await queueReview(user, b.encounterId) }, 201);
  return json({ policy: await setPolicy(user, b) });
});
