"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { StyleRule } from "@/lib/types";
import { Plus, X } from "./icons";
import { Spinner } from "./ui";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function SettingsView({ user, templates, rules: initialRules, engine }: { user: { name: string; email: string; specialty: string; prefs: { defaultTemplate?: string; state?: string; outputLang?: string } }; templates: { id: string; name: string }[]; rules: StyleRule[]; engine: { llm: boolean; model: string | null } }) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [kind, setKind] = useState<StyleRule["kind"]>("always_include");

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    await api("/auth/me", { method: "PATCH", body: { name: f.get("name"), specialty: f.get("specialty"), prefs: { defaultTemplate: f.get("defaultTemplate"), state: f.get("state"), outputLang: f.get("outputLang") } } });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function addRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api<{ rules: StyleRule[] }>("/style-rules", { body: { kind, section: f.get("section") || "*", value: kind === "abbreviate" ? "standard" : f.get("value") } });
    setRules(r.rules);
    e.currentTarget.reset();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
      <h1 className="font-serif text-3xl">Settings</h1>
      <form onSubmit={saveProfile} className="card grid gap-4 p-5 sm:grid-cols-2">
        <p className="col-span-full text-sm font-semibold">Profile &amp; defaults</p>
        <div><label className="label" htmlFor="sname">Name</label><input id="sname" name="name" className="input" defaultValue={user.name} /></div>
        <div><label className="label" htmlFor="sspec">Specialty</label><input id="sspec" name="specialty" className="input" defaultValue={user.specialty} /></div>
        <div><label className="label" htmlFor="stpl">Default template</label><select id="stpl" name="defaultTemplate" className="input" defaultValue={user.prefs.defaultTemplate ?? "soap"}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label" htmlFor="sstate">Practice state (for consent rules)</label><select id="sstate" name="state" className="input" defaultValue={user.prefs.state ?? "IL"}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label" htmlFor="slang">Default patient summary language</label><select id="slang" name="outputLang" className="input" defaultValue={user.prefs.outputLang ?? "en"}><option value="en">English</option><option value="es">Spanish</option></select></div>
        <div className="col-span-full flex items-center justify-end gap-3">{saved && <span className="text-sm text-ok" role="status">Saved</span>}<button className="btn-primary" disabled={busy}>{busy && <Spinner />} Save</button></div>
      </form>

      <div className="card p-5" data-testid="engine-settings">
        <p className="text-sm font-semibold">Documentation engine</p>
        {engine.llm ? (
          <p className="mt-1 text-sm text-ink-2">Claude <span className="font-mono">{engine.model}</span> drafts notes, translates summaries, and answers free-form questions. The on-device engine still verifies every draft: evidence links, omissions, coding, and order safety.</p>
        ) : (
          <p className="mt-1 text-sm text-ink-2">Running the on-device clinical engine: deterministic, offline, and nothing leaves this server. Set <span className="kbd">ANTHROPIC_API_KEY</span> to let Claude draft notes, translate into any language, and handle free-form edits. Set <span className="kbd">CHARTSIDE_MODEL</span> to choose the model.</p>
        )}
      </div>

      <div className="card p-5" data-testid="style-rules">
        <p className="text-sm font-semibold">Style rules</p>
        <p className="mt-1 text-sm text-ink-3">Learned rules come from your edits at signing and switch on after the same edit is seen twice. Manual rules apply immediately.</p>
        <ul className="mt-3 divide-y divide-line">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={r.active} onChange={async (e) => setRules((await api<{ rules: StyleRule[] }>(`/style-rules/${r.id}`, { method: "PATCH", body: { active: e.target.checked } })).rules)} aria-label={`Toggle ${r.label}`} />
                <span className="h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-brand" />
                <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
              </label>
              <span className="flex-1">{r.label}</span>
              <span className="pill bg-sunken text-ink-3">{r.source === "learned" ? `learned · ${r.support}×` : "manual"}</span>
              <button className="text-ink-4 hover:text-rec" onClick={async () => setRules((await api<{ rules: StyleRule[] }>(`/style-rules/${r.id}`, { method: "DELETE" })).rules)} aria-label={`Delete ${r.label}`}><X size={15} /></button>
            </li>
          ))}
          {!rules.length && <li className="py-3 text-sm text-ink-3">No rules yet.</li>}
        </ul>
        <form onSubmit={addRule} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <div><label className="label" htmlFor="rkind">Rule</label><select id="rkind" className="input w-48" value={kind} onChange={(e) => setKind(e.target.value as StyleRule["kind"])}><option value="always_include">Always include line</option><option value="drop_phrase">Never include lines starting…</option><option value="max_words">Max words for section</option><option value="abbreviate">Use abbreviations</option></select></div>
          <div><label className="label" htmlFor="rsec">Section key</label><input id="rsec" name="section" className="input w-40" placeholder="assessment_plan" /></div>
          {kind !== "abbreviate" && <div className="min-w-48 flex-1"><label className="label" htmlFor="rval">Value</label><input id="rval" name="value" className="input" required placeholder={kind === "max_words" ? "120" : "Patient verbalized understanding."} /></div>}
          <button className="btn-outline"><Plus /> Add rule</button>
        </form>
      </div>
    </div>
  );
}
