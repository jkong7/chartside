import { authed, body, json } from "@/lib/server/http";
import { pushConfigured, pushCount, pushPublicKey, subscribePush, unsubscribePush } from "@/lib/server/push";

export const GET = authed(async (_req, user) => json({ configured: pushConfigured() && !!pushPublicKey(), publicKey: pushPublicKey(), subscriptions: await pushCount(user.id), guest: !!user.guestUntil }));

export const POST = authed(async (req, user) => {
  const b = await body<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req);
  return json(await subscribePush(user, b, req.headers.get("user-agent")), 201);
});

export const DELETE = authed(async (req, user) => {
  const b = await body<{ endpoint?: string }>(req);
  return json(await unsubscribePush(user, b.endpoint ?? ""));
});
