import { deleteForm, saveMapping } from "@/lib/server/forms";
import { authed, body, json } from "@/lib/server/http";

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ mapping?: Record<string, string> }>(req);
  return json({ form: await saveMapping(user, id, b.mapping ?? {}) });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await deleteForm(user, id);
  return json({ ok: true });
});
