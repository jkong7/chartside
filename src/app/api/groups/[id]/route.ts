import { assign, createMemberNotes, groupDetail } from "@/lib/server/group";
import { authed, body, fail, json } from "@/lib/server/http";
import { Invalid } from "@/lib/server/policy";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const g = await groupDetail(user, id);
  return g ? json({ group: g }) : fail("Group not found", 404);
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ action?: string; utteranceId?: string; memberId?: string | null }>(req);
  if (b.action === "assign") {
    await assign(user, id, b.utteranceId ?? "", b.memberId ?? null);
    return json({ group: await groupDetail(user, id) });
  }
  if (b.action === "notes") return json({ created: await createMemberNotes(user, id), group: await groupDetail(user, id) });
  throw new Invalid("Unknown action");
});
