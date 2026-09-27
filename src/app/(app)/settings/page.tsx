import SettingsView from "@/components/SettingsView";
import { llmEnabled, llmModel } from "@/lib/llm";
import { speechConfig } from "@/lib/server/audio";
import EhrCard from "@/components/EhrCard";
import { connections, ehrConfig, systemLabel } from "@/lib/server/ehr";
import { requireUser } from "@/lib/server/auth";
import { styleRules, templates } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ ehr_error?: string; ehr_connected?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const cfg = ehrConfig();
  const ehr = {
    configured: cfg.configured,
    clientId: cfg.clientId ? `${cfg.clientId.slice(0, 6)}…` : null,
    defaultIss: cfg.defaultIss,
    label: cfg.label,
    connections: (await connections.list(user.id)).map((c) => ({ ...c, system: systemLabel(c.iss), expired: new Date(c.expiresAt) < new Date() })),
  };
  return (
    <SettingsView
      ehr={<EhrCard initial={ehr} error={sp.ehr_error} connected={sp.ehr_connected === "1"} autoFile={user.prefs.autoFileEhr !== false} />}
      user={{ name: user.name, email: user.email, specialty: user.specialty, prefs: user.prefs }}
      templates={(await templates.list(user)).map((t) => ({ id: t.id, name: t.name }))}
      rules={await styleRules.list(user.id)}
      engine={{ llm: llmEnabled(), model: llmEnabled() ? llmModel() : null }}
      speech={speechConfig()}
    />
  );
}
