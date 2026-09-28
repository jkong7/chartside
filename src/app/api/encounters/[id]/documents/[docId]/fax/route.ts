import { documentPdf, documents, referralDocs } from "@/lib/server/documents";
import { authed, body, fail, json } from "@/lib/server/http";
import { sendFax } from "@/lib/server/notify";
import { assertCan, Invalid } from "@/lib/server/policy";
import { encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string; docId: string }>(async (req, user, { id, docId }) => {
  assertCan(user, "clinical.edit");
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const doc = docId.startsWith("referral-") ? (await referralDocs(enc.id)).find((d) => d.id === docId) : await documents.get(enc.id, docId);
  if (!doc) return fail("Document not found", 404);
  if ("status" in doc && doc.status !== "final") throw new Invalid("Sign the document before faxing it");
  const b = await body<{ to?: string }>(req);
  return json(await sendFax(user, { encounterId: enc.id, to: b.to ?? "", pdf: Buffer.from(await documentPdf(enc, doc)), name: doc.title, kind: "document_fax" }));
});
