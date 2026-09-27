"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SegmentPlayer } from "@/lib/audio/player";
import { age, api, copyText, fmtDate, fmtTime } from "@/lib/client";
import { roleLabel } from "@/lib/roles";
import type { Note, NoteSentence, OmissionFlag, Speaker, StagedOrder, Utterance } from "@/lib/types";
import { Alert, Check, Copy, Download, Play, Refresh, Shield } from "../icons";
import { Modal, Spinner, StatusPill, Tabs, Toast } from "../ui";
import Assistant from "./Assistant";
import BillingPanel from "./BillingPanel";
import Capture from "./Capture";
import NoteEditor from "./NoteEditor";
import { AuditPanel, CodesPanel, LettersPanel, OrdersPanel, SummaryPanel } from "./Panels";
import PreVisit from "./PreVisit";
import Transcript from "./Transcript";
import type { Bundle, Highlight } from "./types";

type Tab = "note" | "codes" | "orders" | "billing" | "summary" | "letters" | "audit";

export default function Workspace({ id, initialTab }: { id: string; initialTab?: string }) {
  const [b, setB] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"mic" | "simulate" | "type" | null>(null);
  const [tab, setTab] = useState<Tab>((["note", "codes", "orders", "billing", "summary", "letters", "audit"].includes(initialTab ?? "") ? initialTab : "note") as Tab);
  const [hl, setHl] = useState<Highlight | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [signing, setSigning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [regen, setRegen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      setB(await api<Bundle>(`/encounters/${id}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load visit");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const cite = useCallback((ids: string[], source?: string) => setHl({ ids, source, nonce: Date.now() }), []);
  const audioChunks = b?.audio.chunks ?? 0;
  const player = useMemo(() => (audioChunks > 0 ? new SegmentPlayer(`/api/encounters/${id}/audio`) : null), [audioChunks, id]);

  if (err) return <div className="p-10 text-rec">{err}</div>;
  if (!b) return <div className="flex h-screen items-center justify-center text-brand"><Spinner /></div>;

  const enc = b.encounter;
  const p = b.patient;
  const signed = enc.status === "signed";
  const locked = signed || !b.access.edit;
  const capturing = enc.status === "recording" || enc.status === "paused" || !!mode;
  const reviewable = (enc.status === "review" || enc.status === "signed") && b.note;

  async function start(m: "mic" | "simulate" | "type") {
    await api(`/encounters/${id}`, { method: "PATCH", body: { action: "start", manual: m === "type" && b?.consent?.decision !== "granted" } });
    await load();
    setMode(m);
  }

  async function sign(force = false) {
    setSigning(true);
    try {
      const r = await fetch(`/api/encounters/${id}/sign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
      const data = (await r.json()) as { signed: boolean; blockers: string[]; learned?: number; error?: string; filing?: { status: string; reference?: string; message?: string } | null };
      if (data.signed) {
        setSignOpen(false);
        const filed = data.filing ? (data.filing.status === "filed" ? ` Filed to ${b?.artifacts.ehr_link?.system ?? "the EHR"}.` : ` Filing to ${b?.artifacts.ehr_link?.system ?? "the EHR"} failed.`) : "";
        setToast(`${data.learned ? `Signed. Chartside learned ${data.learned} style preference${data.learned > 1 ? "s" : ""} from your edits.` : "Note signed."}${filed}`);
        await load();
      } else {
        setBlockers(data.blockers ?? [data.error ?? "Could not sign"]);
        setSignOpen(true);
      }
    } finally {
      setSigning(false);
    }
  }

  async function regenerate(templateId: string) {
    setRegen(true);
    try {
      await api(`/encounters/${id}/finish`, { body: { templateId } });
      await load();
      setToast("Note redrafted with the new template.");
    } finally {
      setRegen(false);
    }
  }

  const header = (
    <header className="z-20 flex min-h-[73px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur md:sticky md:top-0 md:px-6">
      <Link href="/today" className="whitespace-nowrap text-sm text-ink-3 hover:text-ink">← Today</Link>
      <div className="hidden h-8 w-px bg-line sm:block" />
      <div className="min-w-0 flex-1 md:flex-none">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-serif text-xl" data-testid="patient-name">{p?.name ?? "Unassigned patient"}</h1>
          {p && <span className="whitespace-nowrap text-sm text-ink-3">{age(p.dob)}{p.sex} · MRN {p.mrn}</span>}
          {p?.chart.allergies.map((a) => <span key={a.substance} className="pill bg-rec-50 text-[10px] text-rec">{a.substance}</span>)}
        </div>
        <p className="truncate text-xs text-ink-3">{enc.reason || "No reason given"} · {fmtDate(enc.scheduledAt)} {fmtTime(enc.scheduledAt)}{b.clinician.id !== b.access.userId ? <span data-testid="visit-clinician"> · {b.clinician.name}</span> : null}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        {b.artifacts.ehr_link && (
          <span className="pill whitespace-nowrap bg-info-50 text-info" data-testid="ehr-chip" title={`${b.artifacts.ehr_link.iss}\nPatient/${b.artifacts.ehr_link.patient}${b.artifacts.ehr_link.encounter ? `\nEncounter/${b.artifacts.ehr_link.encounter}` : ""}`}>
            {b.artifacts.ehr_link.system} · {b.artifacts.ehr_link.encounter ? "encounter linked" : "patient linked"}
          </span>
        )}
        {locked && b.artifacts.ehr_filing && (
          b.artifacts.ehr_filing.status === "filed" ? (
            <span className="pill whitespace-nowrap bg-ok-50 text-ok" data-testid="ehr-filed" title={b.artifacts.ehr_filing.reference}><Check size={12} /> Filed to {b.artifacts.ehr_link?.system ?? "EHR"}</span>
          ) : (
            <button className="pill whitespace-nowrap bg-rec-50 text-rec" data-testid="ehr-retry" title={b.artifacts.ehr_filing.message} onClick={async () => { const r = await fetch(`/api/encounters/${id}/ehr/file`, { method: "POST" }); const j = await r.json(); setToast(j.filing?.status === "filed" ? "Filed to the EHR." : `Filing failed: ${j.filing?.message ?? j.error}`); await load(); }}>
              <Alert size={12} /> Filing failed · retry
            </button>
          )
        )}
        {locked && b.artifacts.ehr_link && !b.artifacts.ehr_filing && (
          <button className="btn-outline" data-testid="ehr-file" onClick={async () => { await fetch(`/api/encounters/${id}/ehr/file`, { method: "POST" }); await load(); }}>File to {b.artifacts.ehr_link.system}</button>
        )}
        <StatusPill status={enc.status} />
        {reviewable && (
          <>
            {!locked && (
              <select className="input w-44 py-1.5 text-sm" value={enc.templateId ?? b.template.id} onChange={(e) => regenerate(e.target.value)} disabled={regen} aria-label="Template">
                {b.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {regen && <Spinner className="text-brand" />}
            <button className="btn-outline" onClick={async () => { const r = await api<{ text: string }>(`/encounters/${id}/export`); await copyText(r.text); setToast("Note copied. Paste it into your EHR."); }} data-testid="copy-note">
              <Copy /> Copy for EHR
            </button>
            <a className="btn-outline" href={`/api/encounters/${id}/export?format=fhir`} data-testid="fhir"><Download /> FHIR</a>
            {!signed && b.access.sign && <button className="btn-primary" disabled={signing} onClick={() => sign(false)} data-testid="sign">{signing ? <Spinner /> : <Shield />} Sign note</button>}
            {!signed && !b.access.sign && <span className="pill whitespace-nowrap bg-warn-50 text-warn" data-testid="awaiting-signature">Awaiting {b.clinician.name}&apos;s signature</span>}
          </>
        )}
      </div>
    </header>
  );

  if (enc.status === "processing") {
    return (<>{header}<div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-ink-3"><Spinner className="text-brand" /> Drafting note… <button className="btn-ghost" onClick={load}><Refresh /> Refresh</button></div></>);
  }

  if (capturing && !reviewable) {
    return (
      <>
        {header}
        <Capture b={b} initialMode={mode ?? "type"} onFinished={() => { setMode(null); load(); }} />
      </>
    );
  }

  if (!reviewable) {
    return (
      <>
        {header}
        {b.access.capture ? <PreVisit b={b} onChange={load} onStart={start} /> : <p className="mx-auto mt-16 max-w-md text-center text-sm text-ink-3" data-testid="readonly-visit">No note has been drafted for this visit yet. Your role ({roleLabel(b.access.role)}) can view visits but not record them.</p>}
      </>
    );
  }

  const note = b.note!.content;
  const omissions = b.artifacts.omissions ?? [];
  const interp = b.artifacts.interpreter;
  const flaggedLines = new Set((interp?.flags ?? []).flatMap((f) => [f.sourceId, f.renderedId]));
  const hlUtts = hl?.ids.length ? b.utterances.filter((u) => hl.ids.includes(u.id)) : [];
  const staged = b.orders.filter((o) => o.status === "staged").length;

  return (
    <>
      {header}
      <div className="grid grid-cols-1 lg:h-[calc(100vh-73px)] lg:grid-cols-[minmax(0,1fr)_400px]">
        <main className="min-h-0 overflow-y-auto px-4 py-4 md:px-6">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "note", label: "Note" },
              { id: "codes", label: "Codes", badge: b.artifacts.coding ? <span className="pill bg-sunken text-[10px]">{b.artifacts.coding.em.code}</span> : null },
              { id: "orders", label: "Orders", badge: staged ? <span className="pill bg-warn-50 text-[10px] text-warn">{staged}</span> : null },
              { id: "billing", label: "Billing", badge: b.claim ? <span className={`h-2 w-2 rounded-full ${b.claim.status === "needs_review" ? "bg-warn" : b.claim.status === "on_hold" ? "bg-rec" : "bg-ok"}`} /> : (b.artifacts.priorAuth?.length ? <span className="pill bg-sunken text-[10px]">PA</span> : null) },
              { id: "summary", label: "Patient summary", badge: b.patientFlags.some((f) => !f.resolved) ? <span className="h-2 w-2 rounded-full bg-warn" /> : null },
              { id: "letters", label: "Letters", badge: b.artifacts.letters?.length ? <span className="pill bg-sunken text-[10px]">{b.artifacts.letters.length}</span> : null },
              { id: "audit", label: "Audit" },
            ]}
          />
          <div className="py-5">
            {tab === "note" && interp?.flags.length ? (
              <div className="mb-4 rounded-xl border border-warn/30 bg-warn-50/60 p-3" data-testid="interpreter-flags">
                <p className="flex items-center gap-1.5 px-1 text-sm font-semibold text-warn"><Alert size={15} /> Interpretation check: {interp.flags.length} possible discrepanc{interp.flags.length === 1 ? "y" : "ies"}</p>
                <ul className="mt-2 space-y-1.5">
                  {interp.flags.map((f) => (
                    <li key={f.id} className="rounded-lg bg-surface px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-warn">{f.message}</p>
                      <p className="mt-1"><span className="text-ink-3">Said:</span> {f.source}</p>
                      <p><span className="text-ink-3">Interpreted:</span> {f.rendered}</p>
                      <button className="mt-1 text-xs font-medium text-brand" onClick={() => cite([f.sourceId, f.renderedId])}>Show in transcript</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {tab === "note" && (
              <NoteEditor
                encounterId={id}
                note={note}
                omissions={omissions}
                locked={locked}
                activeSentence={active}
                feedback={b.feedback}
                onSelect={(s: NoteSentence | null) => {
                  setActive(s?.id ?? null);
                  if (s) cite(s.evidence.filter((x) => x !== "chart"), s.id);
                  else setHl(null);
                }}
                onSaved={(n: Note, om?: OmissionFlag[]) => setB((x) => (x ? { ...x, note: { ...x.note!, content: n }, artifacts: { ...x.artifacts, omissions: om ?? x.artifacts.omissions } } : x))}
              />
            )}
            {tab === "codes" && <CodesPanel coding={b.artifacts.coding} onCite={(ids) => cite(ids)} />}
            {tab === "orders" && <OrdersPanel encounterId={id} orders={b.orders} locked={locked} onChange={(fn: (o: StagedOrder[]) => StagedOrder[]) => setB((x) => (x ? { ...x, orders: fn(x.orders) } : x))} onCite={(ids) => cite(ids)} />}
            {tab === "billing" && <BillingPanel key={b.claim?.updatedAt ?? "draft"} encounterId={id} record={b.claim} draft={b.artifacts.claim} priorAuth={b.artifacts.priorAuth ?? []} signed={signed} canReview={b.access.billingReview} onCite={(ids) => cite(ids)} />}
            {tab === "summary" && <SummaryPanel b={b} onFlags={load} />}
            {tab === "letters" && <LettersPanel letters={b.artifacts.letters} />}
            {tab === "audit" && <AuditPanel b={b} />}
          </div>
        </main>
        <aside className="flex h-[80vh] min-h-0 flex-col border-t border-line bg-paper lg:h-auto lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Transcript · {b.utterances.length} lines</p>
            {hl?.ids.length ? (
              <div className="flex items-center gap-3">
                {player && hlUtts.length > 0 && (
                  <button className="flex items-center gap-1 text-xs font-medium text-brand" onClick={() => player.play(Math.min(...hlUtts.map((u) => u.tStart)), Math.max(...hlUtts.map((u) => u.tEnd)))} data-testid="play-evidence"><Play size={11} /> Play source</button>
                )}
                <button className="text-xs text-brand" onClick={() => { setHl(null); setActive(null); player?.stop(); }}>Clear highlight</button>
              </div>
            ) : <p className="text-[11px] text-ink-4">{player ? "Click a sentence to see and hear its source" : "Click a sentence to see its source"}</p>}
          </div>
          {hl && hl.ids.length === 0 && <p className="border-b border-line bg-sunken px-4 py-2 text-xs text-ink-3">This line comes from the chart or was written by you. It has no transcript source.</p>}
          <div className="min-h-0 flex-1">
            <Transcript
              utterances={b.utterances}
              player={player}
              flagged={flaggedLines}
              highlight={hl}
              editable={!locked}
              onSpeaker={async (uid: string, speaker: Speaker) => { const r = await api<{ utterance: Utterance }>(`/encounters/${id}/utterances/${uid}`, { method: "PATCH", body: { speaker } }); setB((x) => (x ? { ...x, utterances: x.utterances.map((u) => (u.id === uid ? r.utterance : u)) } : x)); setDirty(true); }}
              onRedact={async (uid: string, redacted: boolean) => { const r = await api<{ utterance: Utterance }>(`/encounters/${id}/utterances/${uid}`, { method: "PATCH", body: { redacted } }); setB((x) => (x ? { ...x, utterances: x.utterances.map((u) => (u.id === uid ? r.utterance : u)) } : x)); setDirty(true); }}
            />
          </div>
          {!locked && dirty && (
            <button className="border-t border-line bg-surface px-4 py-2 text-left text-xs text-brand hover:bg-sunken" onClick={async () => { await regenerate(enc.templateId ?? b.template.id); setDirty(false); }} data-testid="redraft">Transcript changed. Redraft note ↻</button>
          )}
          <Assistant encounterId={id} disabled={locked} onNote={(n: Note) => setB((x) => (x ? { ...x, note: { ...x.note!, content: n } } : x))} onCite={(ids) => cite(ids)} />
        </aside>
      </div>

      <Modal open={signOpen} onClose={() => setSignOpen(false)} title="Before you sign">
        <ul className="space-y-2 text-sm" data-testid="sign-blockers">
          {blockers.map((x) => <li key={x} className="rounded-lg bg-warn-50 px-3 py-2 text-warn">{x}</li>)}
        </ul>
        <p className="mt-3 text-sm text-ink-3">You can review these first, or sign now and take responsibility for the note as written. Unreviewed orders will not be sent.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setSignOpen(false)}>Review first</button>
          {!blockers.some((x) => /blocking safety alert/.test(x)) && (
            <button className="btn-primary" onClick={() => sign(true)} disabled={signing} data-testid="sign-anyway">{signing ? <Spinner /> : <Check />} Sign anyway</button>
          )}
        </div>
      </Modal>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </>
  );
}
