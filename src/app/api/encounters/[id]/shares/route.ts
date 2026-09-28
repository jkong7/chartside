import { authed, body, json } from "@/lib/server/http";
import { listShares, shareExternal, shareWithMember } from "@/lib/server/sharing";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json({ shares: await listShares(user, id) }));

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ kind?: string; userId?: string; access?: "view" | "edit"; email?: string; days?: number; message?: string }>(req);
  if (b.kind === "external") return json(await shareExternal(user, id, b, new URL(req.url).origin), 201);
  return json({ share: await shareWithMember(user, id, b) }, 201);
});
