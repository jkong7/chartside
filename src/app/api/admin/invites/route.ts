import { inviteMember } from "@/lib/server/admin";
import { authed, body, json } from "@/lib/server/http";
import { assertCan } from "@/lib/server/policy";
import type { Role } from "@/lib/server/repo";

export const POST = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const b = await body<{ email?: string; role?: Role }>(req);
  const out = await inviteMember(user, b.email ?? "", b.role ?? "clinician", new URL(req.url).origin);
  return json(out, 201);
});
