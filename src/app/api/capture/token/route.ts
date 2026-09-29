import { listCaptureTokens, mintCaptureToken } from "@/lib/server/captureTokens";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed(async (_req, user) => json({ tokens: await listCaptureTokens(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ minutes?: number; label?: string; device?: boolean }>(req);
  return json(await mintCaptureToken(user, { minutes: b.minutes, label: b.label, source: "session", device: b.device === true }), 201);
});
