import { revokeCaptureToken } from "@/lib/server/captureTokens";
import { authed, json } from "@/lib/server/http";

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await revokeCaptureToken(user, id);
  return json({ ok: true });
});
