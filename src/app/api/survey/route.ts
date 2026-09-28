import { authed, body, json } from "@/lib/server/http";
import { snoozeSurvey, submitSurvey } from "@/lib/server/survey";

export const POST = authed(async (req, user) => {
  const b = await body<{ action?: string; score?: number; comment?: string }>(req);
  if (b.action === "snooze") await snoozeSurvey(user);
  else await submitSurvey(user, b);
  return json({ ok: true });
});
