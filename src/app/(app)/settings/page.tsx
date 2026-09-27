import SettingsView from "@/components/SettingsView";
import { llmEnabled, llmModel } from "@/lib/llm";
import { requireUser } from "@/lib/server/auth";
import { styleRules, templates } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await requireUser();
  return (
    <SettingsView
      user={{ name: user.name, email: user.email, specialty: user.specialty, prefs: user.prefs }}
      templates={templates.list(user.id).map((t) => ({ id: t.id, name: t.name }))}
      rules={styleRules.list(user.id)}
      engine={{ llm: llmEnabled(), model: llmEnabled() ? llmModel() : null }}
    />
  );
}
