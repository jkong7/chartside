import { rotateInboundSecret } from "@/lib/server/faxin";
import { authed, json } from "@/lib/server/http";

export const POST = authed(async (req, user) => json({ secret: await rotateInboundSecret(user), url: `${new URL(req.url).origin}/api/fax/inbound/${user.orgId}` }));
