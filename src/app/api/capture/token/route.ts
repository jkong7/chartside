import { mintCaptureToken } from "@/lib/server/captureTokens";
import { authed, body, json } from "@/lib/server/http";

export const POST = authed(async (req, user) => {
  const b = await body<{ minutes?: number; label?: string }>(req);
  return json(await mintCaptureToken(user, { minutes: b.minutes, label: b.label, source: "session" }), 201);
});
