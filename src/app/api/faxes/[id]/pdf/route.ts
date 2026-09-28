import { get } from "@/lib/db";
import { authed, fail } from "@/lib/server/http";
import { audit } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const r = await get<{ pdf: string }>("SELECT pdf FROM inbound_faxes WHERE org_id = ? AND id = ?", user.orgId, id);
  if (!r?.pdf) return fail("Fax not found", 404);
  await audit.log(user, null, "fax.viewed", { id });
  return new Response(new Uint8Array(Buffer.from(r.pdf, "base64")), { headers: { "content-type": "application/pdf" } });
});
