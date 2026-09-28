import { authed, body, json } from "@/lib/server/http";
import { deleteDocument, documents, updateDocument } from "@/lib/server/documents";
import { assertCan } from "@/lib/server/policy";

export const PATCH = authed<{ id: string; docId: string }>(async (req, user, { id, docId }) => {
  assertCan(user, "clinical.edit");
  const b = await body<{ fields?: Record<string, string>; body?: string; shared?: boolean; action?: "finalize" | "reopen" }>(req);
  const doc = await updateDocument(user, id, docId, b);
  return json({ document: doc, documents: await documents.list(id) });
});

export const DELETE = authed<{ id: string; docId: string }>(async (_req, user, { id, docId }) => {
  assertCan(user, "clinical.edit");
  await deleteDocument(user, id, docId);
  return json({ documents: await documents.list(id) });
});
