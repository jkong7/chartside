import { authed, body, json } from "@/lib/server/http";
import { Invalid } from "@/lib/server/policy";
import { confirmEnrollment, disableMfa, mfaStatus, startEnrollment } from "@/lib/server/security";

export const GET = authed(async (_req, user) => json({ mfa: await mfaStatus(user.id) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ action?: "start" | "confirm" | "disable"; code?: string }>(req);
  if (b.action === "start") return json(await startEnrollment(user));
  if (b.action === "confirm") return json(await confirmEnrollment(user, b.code ?? ""));
  if (b.action === "disable") {
    await disableMfa(user, b.code ?? "");
    return json({ mfa: await mfaStatus(user.id) });
  }
  throw new Invalid("Unknown action");
});
