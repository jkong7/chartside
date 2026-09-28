import { authed, body, fail, json } from "@/lib/server/http";
import { tasks } from "@/lib/server/inbox";
import { audit } from "@/lib/server/repo";

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const t = await tasks.get(user, id);
  if (!t) return fail("Task not found", 404);
  if (t.assigneeId !== user.id && !["owner", "admin", "scribe"].includes(user.role)) return fail("This task belongs to someone else", 403);
  const b = await body<{ status?: "open" | "done" | "dismissed" }>(req);
  if (!b.status || !["open", "done", "dismissed"].includes(b.status)) return fail("Invalid status");
  await tasks.setStatus(user, id, b.status);
  await audit.log(user, t.encounterId, `task.${b.status}`, { id, title: t.title });
  return json({ task: await tasks.get(user, id) });
});
