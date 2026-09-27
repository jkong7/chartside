import { authed, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import { encounters, patients } from "@/lib/server/repo";
import { seedSchedule } from "@/lib/server/seed";

export const POST = authed(async (_req, user) => {
  assertCan(user, "clinical.create");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  await encounters.removeToday(user, start.toISOString(), end.toISOString());
  await patients.removeOrphans(user);
  return json({ encounters: await seedSchedule(user) });
});
