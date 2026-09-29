import { mintCaptureToken } from "@/lib/server/captureTokens";
import { apiHandler } from "@/lib/server/platform";

export const POST = apiHandler("encounters:write", async (req, user, _params, keyId) => {
  const b = (await req.json().catch(() => ({}))) as { minutes?: number; label?: string };
  return { data: await mintCaptureToken(user, { minutes: b.minutes, label: b.label, source: "api_key", keyId }) };
});
