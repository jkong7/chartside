import { fail } from "@/lib/server/http";
import { documentPdf, documents } from "@/lib/server/documents";
import { audit, encounterByShareToken } from "@/lib/server/repo";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await ctx.params;
  const enc = await encounterByShareToken(token);
  if (!enc) return fail("This link is no longer valid", 404);
  const doc = (await documents.shared(enc.id)).find((d) => d.id === docId);
  if (!doc) return fail("Document not found", 404);
  await audit.log(null, enc.id, "document.patient_downloaded", { id: docId });
  return new Response(new Uint8Array(await documentPdf(enc, doc)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${doc.title.replace(/[^\w .-]+/g, "").slice(0, 80) || "document"}.pdf"` } });
}
