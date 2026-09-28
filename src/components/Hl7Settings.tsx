"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "./ui";

type Cfg = { enabled: boolean; host: string; port: number; sendingFacility: string; receivingApp: string; receivingFacility: string; includeSensitive: boolean };
type Log = { id: string; encounter_id: string; control_id: string; status: string; detail: string; created_at: string };

export default function Hl7Settings() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [log, setLog] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ config: Cfg | null; log: Log[] }>("/admin/hl7").then((r) => { setCfg(r.config ?? { enabled: false, host: "", port: 2575, sendingFacility: "", receivingApp: "EHR", receivingFacility: "", includeSensitive: false }); setLog(r.log); }).catch(() => undefined);
  }, []);
  if (!cfg) return null;
  return (
    <section className="card p-4" data-testid="hl7-settings">
      <p className="text-sm font-semibold">HL7 v2 document interface</p>
      <p className="mt-1 text-xs text-ink-3">Signed notes are sent as MDM^T02 transcription documents over MLLP to your interface engine (Rhapsody, Mirth, Cloverleaf) for EHRs without FHIR write-back. Each message waits for an ACK and is logged here.</p>
      <form className="mt-3 grid gap-3 sm:grid-cols-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ config: Cfg }>("/admin/hl7", { method: "PUT", body: cfg });
          setCfg(r.config);
          setMsg("Saved.");
        } catch (x) {
          setMsg(x instanceof Error ? x.message : "Could not save");
        }
        setBusy(false);
      }}>
        <label className="col-span-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} data-testid="hl7-enabled" /> Send signed notes over HL7</label>
        <label className="col-span-2 block"><span className="label">Host</span><input className="input" value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} placeholder="interface.hospital.org" data-testid="hl7-host" /></label>
        <label className="block"><span className="label">Port</span><input className="input" type="number" value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })} data-testid="hl7-port" /></label>
        <label className="block"><span className="label">Receiving app</span><input className="input" value={cfg.receivingApp} onChange={(e) => setCfg({ ...cfg, receivingApp: e.target.value })} /></label>
        <label className="col-span-2 block"><span className="label">Sending facility</span><input className="input" value={cfg.sendingFacility} onChange={(e) => setCfg({ ...cfg, sendingFacility: e.target.value })} /></label>
        <label className="col-span-2 block"><span className="label">Receiving facility</span><input className="input" value={cfg.receivingFacility} onChange={(e) => setCfg({ ...cfg, receivingFacility: e.target.value })} /></label>
        <label className="col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.includeSensitive} onChange={(e) => setCfg({ ...cfg, includeSensitive: e.target.checked })} /> Also send restricted behavioral health notes (flagged R in TXA)</label>
        <div className="flex items-end justify-end"><button className="btn-primary" disabled={busy} data-testid="hl7-save">{busy ? <Spinner /> : null} Save</button></div>
        {msg && <p className="col-span-4 text-sm text-ink-2" data-testid="hl7-msg">{msg}</p>}
      </form>
      {log.length > 0 && (
        <table className="mt-4 w-full text-xs" data-testid="hl7-log">
          <tbody className="divide-y divide-line">
            {log.map((l) => <tr key={l.id}><td className="py-1 font-mono">{l.control_id}</td><td className={l.status === "accepted" ? "text-ok" : "text-rec"}>{l.status}</td><td className="text-ink-3">{l.detail}</td><td className="text-right text-ink-4">{new Date(l.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td></tr>)}
          </tbody>
        </table>
      )}
    </section>
  );
}
