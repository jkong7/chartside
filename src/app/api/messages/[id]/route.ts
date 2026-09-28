import { authed, body, fail, json } from "@/lib/server/http";
import { closeMessage, messageContext, messages, prepareDraft, sendReply } from "@/lib/server/inbox";
import { Invalid } from "@/lib/server/policy";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  let m = await messages.get(user, id);
  if (!m) return fail("Message not found", 404);
  if (m.status === "new" && ["owner", "admin", "clinician", "scribe"].includes(user.role)) m = await prepareDraft(user, id);
  return json({ message: m, context: await messageContext(user, m) });
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ action?: "draft" | "send" | "close"; text?: string; actions?: string[]; lang?: "en" | "es" }>(req);
  if (b.action === "draft") return json({ message: await prepareDraft(user, id, { lang: b.lang }) });
  if (b.action === "send") return json({ message: await sendReply(user, id, { text: b.text, actions: b.actions }) });
  if (b.action === "close") return json({ message: await closeMessage(user, id) });
  throw new Invalid("Unknown action");
});
