import { connections, ehrConfig, systemLabel } from "@/lib/server/ehr";
import { authed, json } from "@/lib/server/http";

export const GET = authed(async (_req, user) => {
  const cfg = ehrConfig();
  return json({
    configured: cfg.configured,
    clientId: cfg.clientId ? `${cfg.clientId.slice(0, 6)}…` : null,
    defaultIss: cfg.defaultIss,
    label: cfg.label,
    connections: (await connections.list(user.id)).map((c) => ({ ...c, system: systemLabel(c.iss), expired: new Date(c.expiresAt) < new Date() })),
  });
});
