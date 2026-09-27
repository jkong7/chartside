import { authed, fail, json } from "@/lib/server/http";
import { artifacts, audit, encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>((_req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  let share = artifacts.get<{ token: string; createdAt: string }>(enc.id, "share");
  if (!share) {
    share = { token: crypto.randomUUID().replace(/-/g, ""), createdAt: new Date().toISOString() };
    artifacts.set(enc.id, "share", share);
    audit.log(user.id, enc.id, "summary.shared", {});
  }
  return json({ token: share.token, url: `/s/${share.token}` });
});
