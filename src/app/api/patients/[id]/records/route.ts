import { authed, body, json } from "@/lib/server/http";
import { Invalid } from "@/lib/server/policy";
import { importRecord, recordsFor } from "@/lib/server/records";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json({ records: await recordsFor(user, id) }));

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Invalid("Attach a file");
    return json({ record: await importRecord(user, id, { name: file.name, mime: file.type, data: Buffer.from(await file.arrayBuffer()) }) }, 201);
  }
  const b = await body<{ name?: string; text?: string }>(req);
  if (!b.text?.trim()) throw new Invalid("Paste the outside record text");
  return json({ record: await importRecord(user, id, { name: b.name?.trim() || "Pasted record", mime: "text/plain", data: Buffer.from(b.text) }) }, 201);
});
