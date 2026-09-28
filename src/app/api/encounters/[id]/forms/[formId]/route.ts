import { fillForm, previewFill } from "@/lib/server/forms";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed<{ id: string; formId: string }>(async (_req, user, { id, formId }) => json(await previewFill(user, id, formId)));

export const POST = authed<{ id: string; formId: string }>(async (req, user, { id, formId }) => {
  const b = await body<{ values?: Record<string, string>; flatten?: boolean }>(req);
  const { bytes, name } = await fillForm(user, id, formId, b.values ?? {}, b.flatten !== false);
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/[^\w.-]+/g, "-")}.pdf"` } });
});
