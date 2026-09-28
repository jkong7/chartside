import { authed, body, json } from "@/lib/server/http";
import { commitImport, previewImport } from "@/lib/server/schedule";

export const POST = authed(async (req, user) => {
  const b = await body<{ text?: string; date?: string; clinicianId?: string; commit?: boolean }>(req);
  if (b.commit) return json(await commitImport(user, b.text ?? "", b.date ?? "", b.clinicianId));
  return json({ rows: await previewImport(user, b.text ?? "", b.date ?? "", b.clinicianId) });
});
