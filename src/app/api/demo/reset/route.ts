import { run } from "@/lib/db";
import { authed, json } from "@/lib/server/http";
import { seedSchedule } from "@/lib/server/seed";

export const POST = authed((_req, user) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  run("DELETE FROM encounters WHERE user_id = ? AND scheduled_at >= ? AND scheduled_at < ?", user.id, start.toISOString(), end.toISOString());
  run("DELETE FROM patients WHERE user_id = ? AND id NOT IN (SELECT DISTINCT patient_id FROM encounters WHERE patient_id IS NOT NULL)", user.id);
  return json({ encounters: seedSchedule(user) });
});
