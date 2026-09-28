"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import PatientPicker from "./PatientPicker";
import { Spinner } from "./ui";

type Fax = { id: string; from: string; pages: number; status: string; receivedAt: string; preview: string; suggestions: { patientId: string; name: string; why: string[] }[] };

export default function FaxInbox() {
  const [faxes, setFaxes] = useState<Fax[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ faxes: Fax[] }>("/faxes").then((r) => setFaxes(r.faxes)).catch(() => setFaxes([]));
  }, []);
  const open = (faxes ?? []).filter((f) => f.status === "new");
  if (!open.length) return null;
  async function act(body: Record<string, string>) {
    setBusy(body.id);
    setErr(null);
    try {
      setFaxes((await api<{ faxes: Fax[] }>("/faxes", { body })).faxes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not file the fax");
    }
    setBusy(null);
  }
  return (
    <section className="card mt-5 p-4" data-testid="fax-inbox">
      <p className="text-sm font-semibold">Incoming faxes ({open.length})</p>
      {err && <p className="mt-2 text-sm text-rec">{err}</p>}
      <ul className="mt-2 divide-y divide-line">
        {open.map((f) => (
          <li key={f.id} className="py-3 text-sm" data-testid="fax-item">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">From {f.from || "unknown"}</span>
              <span className="text-xs text-ink-3">{new Date(f.receivedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}{f.pages ? ` · ${f.pages} page${f.pages === 1 ? "" : "s"}` : ""}</span>
              <a className="ml-auto text-xs text-brand" href={`/api/faxes/${f.id}/pdf`} target="_blank" rel="noreferrer">View PDF</a>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-ink-3">{f.preview}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {f.suggestions.map((s) => <button key={s.patientId} className="btn-outline px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => act({ id: f.id, patientId: s.patientId })} data-testid="fax-file-suggested">{busy === f.id ? <Spinner /> : null} File to {s.name} <span className="text-ink-4">({s.why.join(", ")})</span></button>)}
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const pid = new FormData(e.currentTarget).get(`pick-${f.id}`) as string; if (pid) act({ id: f.id, patientId: pid }); }}>
                <div className="w-64"><PatientPicker name={`pick-${f.id}`} allowNone={false} /></div>
                <button className="btn-ghost px-2 text-xs">File</button>
              </form>
              <button className="btn-ghost px-2 text-xs text-ink-3" disabled={!!busy} onClick={() => act({ id: f.id, action: "discard" })}>Discard</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
