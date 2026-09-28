import { authed, body, fail, json } from "@/lib/server/http";
import { createDocument, documents, DOCUMENT_TYPES, referralDocs } from "@/lib/server/documents";
import { assertCan } from "@/lib/server/policy";
import { encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  return json({ documents: await documents.list(enc.id), referrals: await referralDocs(enc.id), types: DOCUMENT_TYPES });
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  assertCan(user, "clinical.edit");
  const b = await body<{ type?: string }>(req);
  const doc = await createDocument(user, id, b.type ?? "");
  return json({ document: doc, documents: await documents.list(id) }, 201);
});
