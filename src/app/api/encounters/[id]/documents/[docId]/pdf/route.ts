import { authed, fail } from "@/lib/server/http";
import { documentPdf, documents, referralDocs } from "@/lib/server/documents";
import { audit, encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string; docId: string }>(async (_req, user, { id, docId }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const doc = docId.startsWith("referral-") ? (await referralDocs(enc.id)).find((d) => d.id === docId) : await documents.get(enc.id, docId);
  if (!doc) return fail("Document not found", 404);
  const pdf = await documentPdf(enc, doc);
  await audit.log(user, enc.id, "document.downloaded", { id: docId });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${doc.title.replace(/[^\w .-]+/g, "").slice(0, 80) || "document"}.pdf"` } });
});
