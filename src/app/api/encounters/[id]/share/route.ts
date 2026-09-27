import { assertCan } from "@/lib/server/policy";
import { authed, fail, json } from "@/lib/server/http";
import { artifacts, audit, encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.edit");
  let share = await artifacts.get<{ token: string; createdAt: string }>(enc.id, "share");
  if (!share) {
    share = { token: crypto.randomUUID().replace(/-/g, ""), createdAt: new Date().toISOString() };
    await artifacts.set(enc.id, "share", share);
    await audit.log(user, enc.id, "summary.shared", {});
  }
  return json({ token: share.token, url: `/s/${share.token}` });
});
