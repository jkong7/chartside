import { authed, body, json } from "@/lib/server/http";
import { discardAssessment, fileAssessment, nursingView } from "@/lib/server/nursing";

export const POST = authed<{ id: string; noteId: string }>(async (req, user, { id, noteId }) => {
  const b = await body<{ rows?: { key: string; value: string }[]; care?: boolean }>(req);
  const r = await fileAssessment(user, id, noteId, b);
  return json({ ...r, ...(await nursingView(user, id)) });
});

export const DELETE = authed<{ id: string; noteId: string }>(async (_req, user, { id, noteId }) => {
  await discardAssessment(user, id, noteId);
  return json(await nursingView(user, id));
});
