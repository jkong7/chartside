"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { age, api } from "@/lib/client";
import { TASK_LABEL } from "@/lib/engine/tasks";
import type { inboxFor, Message, messageContext, Task } from "@/lib/server/inbox";
import { Alert, Check, Inbox as InboxIcon, Plus, Refresh, Send, Shield, X } from "./icons";
import { Empty, Kpi, Modal, Spinner, Toast } from "./ui";

type Data = Awaited<ReturnType<typeof inboxFor>>;
type Context = NonNullable<Awaited<ReturnType<typeof messageContext>>>;
type Section = "messages" | "tasks" | "cosign" | "unsigned" | "queries" | "flags";

const URGENCY: Record<string, { label: string; cls: string }> = {
  emergency: { label: "Emergency", cls: "bg-rec text-white" },
  same_day: { label: "Same day", cls: "bg-warn-50 text-warn" },
  routine: { label: "Routine", cls: "bg-sunken text-ink-3" },
};

const INTENT: Record<string, string> = { refill: "Refill", result: "Results", appointment: "Appointment", side_effect: "Side effect", form: "Paperwork", billing: "Billing", symptom: "Symptom", other: "General" };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function dueLabel(t: Task) {
  if (!t.dueAt) return { text: "No due date", cls: "text-ink-4" };
  const d = new Date(t.dueAt);
  const today = new Date();
  const days = Math.floor((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  if (days < 0) return { text: `Overdue ${-days}d`, cls: "text-rec font-medium" };
  if (days === 0) return { text: "Due today", cls: "text-warn font-medium" };
  if (days === 1) return { text: "Due tomorrow", cls: "text-ink-2" };
  return { text: `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, cls: "text-ink-3" };
}

export default function InboxView({ me, initialMessage }: { me: { id: string; name: string; role: string }; initialMessage: string | null }) {
  const [d, setD] = useState<Data | null>(null);
  const [section, setSection] = useState<Section>("messages");
  const [open, setOpen] = useState<string | null>(initialMessage);
  const [toast, setToast] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => setD(await api<Data>("/inbox")), []);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!d || open || section !== "messages") return;
    if (d.messages[0] && typeof window !== "undefined" && window.innerWidth >= 1024) setOpen(d.messages[0].id);
  }, [d, open, section]);

  if (!d) return <div className="flex h-screen items-center justify-center text-brand"><Spinner /></div>;

  const sections: { id: Section; label: string; count: number; tone?: string }[] = [
    { id: "messages", label: "Patient messages", count: d.counts.messages, tone: d.counts.urgent ? "bg-rec text-white" : undefined },
    { id: "tasks", label: "Tasks", count: d.counts.tasks, tone: d.counts.due ? "bg-warn-50 text-warn" : undefined },
    { id: "cosign", label: "Co-sign", count: d.counts.cosign },
    { id: "unsigned", label: "Unsigned notes", count: d.counts.unsigned },
    { id: "queries", label: "Coding queries", count: d.counts.queries },
    { id: "flags", label: "Patient corrections", count: d.counts.flags },
  ];

  async function setTask(t: Task, status: Task["status"]) {
    await api(`/tasks/${t.id}`, { method: "PATCH", body: { status } });
    setToast(status === "done" ? `Done: ${t.title}` : status === "dismissed" ? "Task dismissed." : "Task reopened.");
    load();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Inbox</h1>
          <p className="mt-1 text-sm text-ink-2">Patient messages with drafted replies, follow-up tasks found in your visits, co-signatures, and anything waiting on you.</p>
        </div>
        <button className="btn-ghost" onClick={load}><Refresh size={14} /> Refresh</button>
        <button className="btn-outline" onClick={() => setNewOpen(true)} data-testid="log-message"><Plus size={14} /> Log a message</button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="inbox-kpis">
        <Kpi label="Urgent messages" value={d.counts.urgent} tone={d.counts.urgent ? "warn" : "ink"} hint={`${d.counts.messages} open`} />
        <Kpi label="Tasks due today" value={d.counts.due} tone={d.counts.due ? "warn" : "ink"} hint={`${d.counts.tasks} open`} />
        <Kpi label="Waiting for your co-sign" value={d.counts.cosign} tone="brand" />
        <Kpi label="Unsigned notes" value={d.counts.unsigned} hint={`${d.counts.queries} coding ${d.counts.queries === 1 ? "query" : "queries"}`} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" data-testid="inbox-sections">
          {sections.map((s) => (
            <button key={s.id} onClick={() => { setSection(s.id); setOpen(null); }} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${section === s.id ? "bg-brand-50 font-medium text-brand" : "text-ink-2 hover:bg-sunken"}`} data-testid={`section-${s.id}`}>
              <span className="flex-1">{s.label}</span>
              {s.count > 0 && <span className={`pill text-[10px] ${s.tone ?? "bg-sunken text-ink-3"}`}>{s.count}</span>}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === "messages" && (
            <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <ul className="card divide-y divide-line self-start" data-testid="message-list">
                {d.messages.map((m) => (
                  <li key={m.id}>
                    <button className={`block w-full px-4 py-3 text-left hover:bg-sunken ${open === m.id ? "bg-brand-50/60" : ""}`} onClick={() => setOpen(m.id)} data-testid="message-row">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 truncate text-sm font-medium">{m.patientName}</span>
                        <span className="text-[11px] text-ink-4">{ago(m.receivedAt)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-ink-2">{m.subject}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {m.triage.urgency !== "routine" && <span className={`pill text-[10px] ${URGENCY[m.triage.urgency].cls}`} data-testid="urgency">{URGENCY[m.triage.urgency].label}</span>}
                        <span className="pill bg-sunken text-[10px] text-ink-3">{INTENT[m.triage.intent]}</span>
                        {m.triage.lang === "es" && <span className="pill bg-info-50 text-[10px] text-info">Español</span>}
                        {m.status === "drafted" && <span className="pill bg-brand-50 text-[10px] text-brand">Draft ready</span>}
                        {m.assigneeId !== me.id && m.assigneeName && <span className="text-[10px] text-ink-4">{m.assigneeName}</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {!d.messages.length && <li className="px-4 py-10 text-center text-sm text-ink-3">No open patient messages.</li>}
              </ul>
              {open ? <MessageDetail key={open} id={open} me={me} onDone={(msg) => { setToast(msg); setOpen(null); load(); }} /> : <div className="hidden xl:block"><Empty title="Choose a message">Replies are drafted from the chart. Nothing is sent until you press Send.</Empty></div>}
            </div>
          )}
          {section === "tasks" && (
            <ul className="card divide-y divide-line" data-testid="task-list">
              {d.tasks.map((t) => {
                const due = dueLabel(t);
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3" data-testid="task-row">
                    <button className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong hover:border-brand" aria-label={`Mark ${t.title} done`} onClick={() => setTask(t, "done")} data-testid="task-done"><Check size={12} className="text-transparent hover:text-brand" /></button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="mt-0.5 text-xs text-ink-3">{t.patientName ? `${t.patientName} · ` : ""}<span className="pill bg-sunken text-[10px]">{TASK_LABEL[t.kind]}</span> {t.detail}</p>
                    </div>
                    <span className={`whitespace-nowrap text-xs ${due.cls}`}>{due.text}</span>
                    {t.encounterId && <Link className="text-xs text-brand hover:underline" href={`/encounters/${t.encounterId}`}>Visit</Link>}
                    {t.messageId && <button className="text-xs text-brand hover:underline" onClick={() => { setSection("messages"); setOpen(t.messageId); }}>Message</button>}
                    <button className="btn-ghost px-1.5" aria-label="Dismiss" onClick={() => setTask(t, "dismissed")}><X size={13} /></button>
                  </li>
                );
              })}
              {!d.tasks.length && <li className="px-4 py-10 text-center text-sm text-ink-3">No open tasks. Follow-ups, results to review, referrals, and paperwork from your visits will appear here.</li>}
            </ul>
          )}
          {section === "cosign" && (
            <ul className="card divide-y divide-line" data-testid="cosign-list">
              {d.cosigns.map((c) => (
                <li key={c.encounterId} className="flex items-center gap-3 px-4 py-3">
                  <Shield size={16} className="text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.patientName ?? "Patient"} · {c.reason || "Visit"}</p>
                    <p className="text-xs text-ink-3">Signed by {c.cosign.authorName}{c.cosign.authorCredential ? ` (${c.cosign.authorCredential})` : ""} · {ago(c.cosign.requestedAt)}</p>
                  </div>
                  <Link className="btn-primary" href={`/encounters/${c.encounterId}`} data-testid="cosign-open">Review</Link>
                </li>
              ))}
              {!d.cosigns.length && <li className="px-4 py-10 text-center text-sm text-ink-3">Nothing is waiting for your co-signature.</li>}
            </ul>
          )}
          {section === "unsigned" && (
            <ul className="card divide-y divide-line" data-testid="unsigned-list">
              {d.unsigned.map((u) => (
                <li key={u.encounterId} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{u.patientName ?? "Patient"} · {u.reason || "Visit"}</p>
                    <p className="text-xs text-ink-3">{new Date(u.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{u.cosign?.status === "returned" ? ` · Returned: ${u.cosign.comment}` : ""}</p>
                  </div>
                  {u.cosign?.status === "returned" && <span className="pill bg-warn-50 text-[10px] text-warn">Returned</span>}
                  <Link className="btn-outline" href={`/encounters/${u.encounterId}`}>Open</Link>
                </li>
              ))}
              {!d.unsigned.length && <li className="px-4 py-10 text-center text-sm text-ink-3">All your notes are signed.</li>}
            </ul>
          )}
          {section === "queries" && (
            <ul className="card divide-y divide-line" data-testid="query-list">
              {d.queries.map((q) => (
                <li key={`${q.encounterId}-${q.code}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{q.patientName ?? "Patient"} · <span className="font-mono text-xs">{q.code}</span></p>
                    <p className="text-xs text-ink-3">{q.question}</p>
                  </div>
                  <Link className="btn-outline" href={`/encounters/${q.encounterId}?tab=codes`}>Answer</Link>
                </li>
              ))}
              {!d.queries.length && <li className="px-4 py-10 text-center text-sm text-ink-3">No open documentation queries.</li>}
            </ul>
          )}
          {section === "flags" && (
            <ul className="card divide-y divide-line" data-testid="flag-list">
              {d.flags.map((f, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <Alert size={15} className="text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{f.patientName ?? "Patient"}: &ldquo;{f.item}&rdquo;</p>
                    <p className="text-xs text-ink-3">{f.comment}</p>
                  </div>
                  <Link className="btn-outline" href={`/encounters/${f.encounterId}?tab=summary`}>Review</Link>
                </li>
              ))}
              {!d.flags.length && <li className="px-4 py-10 text-center text-sm text-ink-3">No corrections from patients.</li>}
            </ul>
          )}
        </div>
      </div>
      <LogMessage open={newOpen} onClose={() => setNewOpen(false)} onSaved={(id) => { setNewOpen(false); setSection("messages"); setOpen(id); load(); }} />
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}

function MessageDetail({ id, me, onDone }: { id: string; me: { id: string; role: string }; onDone: (msg: string) => void }) {
  const [m, setM] = useState<Message | null>(null);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ message: Message; context: Context }>(`/messages/${id}`);
    setM(r.message);
    setCtx(r.context);
    setText(r.message.reply ?? r.message.draft ?? "");
    setPicked(new Set((r.message.draftMeta?.actions ?? []).map((a) => a.title)));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const placeholders = useMemo(() => (text.match(/\*\*\*/g) ?? []).length, [text]);
  if (!m || !ctx) return <div className="card flex h-64 items-center justify-center text-brand"><Spinner /></div>;
  const canSend = ["owner", "admin", "clinician"].includes(me.role) && (m.assigneeId === me.id || ["owner", "admin"].includes(me.role));
  const answered = m.status === "replied" || m.status === "closed";

  async function act(action: "draft" | "send" | "close", extra: Record<string, unknown> = {}) {
    setBusy(action);
    setErr(null);
    try {
      const r = await api<{ message: Message }>(`/messages/${id}`, { body: { action, ...extra } });
      if (action === "draft") {
        setM(r.message);
        setText(r.message.draft ?? "");
        setPicked(new Set((r.message.draftMeta?.actions ?? []).map((a) => a.title)));
      } else onDone(action === "send" ? `Reply sent to ${m!.patientName}.` : "Message closed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not complete that");
    } finally {
      setBusy(null);
    }
  }

  const u = URGENCY[m.triage.urgency];
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]" data-testid="message-detail">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl">{ctx.patient.name}</h2>
          <span className="text-sm text-ink-3">{age(ctx.patient.dob)}{ctx.patient.sex} · MRN {ctx.patient.mrn}</span>
          <span className={`pill text-[10px] ${u.cls}`}>{u.label}</span>
          <span className="pill bg-sunken text-[10px]">{INTENT[m.triage.intent]}</span>
          <span className="ml-auto text-xs text-ink-4">{m.channel === "visit_link" ? "From visit summary link" : m.channel === "phone" ? "Phone message" : m.channel === "portal" ? "Portal" : "Logged by staff"} · {ago(m.receivedAt)}</span>
        </div>
        {m.triage.urgency !== "routine" && (
          <p className={`mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${m.triage.urgency === "emergency" ? "bg-rec-50 text-rec" : "bg-warn-50 text-warn"}`} data-testid="triage-banner">
            <Alert size={14} /> {m.triage.urgency === "emergency" ? "Possible emergency" : "Needs a same-day response"}: {m.triage.reasons.join(", ")}. A call task was added to your list and stays open until you mark the call done.
          </p>
        )}
        <div className="mt-3 rounded-lg bg-sunken px-4 py-3">
          {!m.body.startsWith(m.subject) && <p className="mb-1 text-xs font-medium text-ink-3">{m.subject}</p>}
          <p className="whitespace-pre-wrap text-sm" data-testid="message-body">{m.body}</p>
        </div>
        {answered ? (
          <div className="mt-4">
            <p className="label">Your reply · {m.repliedAt ? ago(m.repliedAt) : ""}</p>
            <p className="whitespace-pre-wrap rounded-lg border border-line px-4 py-3 text-sm">{m.reply ?? "Closed without a reply."}</p>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="label mb-0 flex-1">Draft reply {m.draftMeta ? <span className="font-normal normal-case text-ink-4">· {m.draftMeta.engine === "claude" ? "Claude" : "on-device"} · grade {m.draftMeta.readingGrade} reading level</span> : null}</p>
              <div className="flex overflow-hidden rounded-lg border border-line text-xs">
                {(["en", "es"] as const).map((l) => (
                  <button key={l} className={`px-2.5 py-1 ${m.draftMeta?.lang === l ? "bg-brand text-white" : "hover:bg-sunken"}`} onClick={() => act("draft", { lang: l })} disabled={!!busy} data-testid={`draft-${l}`}>{l === "en" ? "English" : "Español"}</button>
                ))}
              </div>
              <button className="btn-ghost px-2 text-xs" onClick={() => act("draft", { lang: m.draftMeta?.lang })} disabled={!!busy}><Refresh size={12} /> Redraft</button>
            </div>
            <textarea className="input mt-2 min-h-[220px] font-[inherit] text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} data-testid="reply-text" />
            {placeholders > 0 && <p className="mt-1 text-xs text-warn" data-testid="placeholder-warning">Replace {placeholders} *** marker{placeholders > 1 ? "s" : ""} with your own words before sending.</p>}
            {(m.draftMeta?.actions.length ?? 0) > 0 && (
              <div className="mt-3 rounded-lg border border-line px-3 py-2">
                <p className="text-xs font-medium text-ink-2">When I send this, add these to my tasks:</p>
                {m.draftMeta!.actions.map((a) => (
                  <label key={a.title} className="mt-1 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={picked.has(a.title)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(a.title); else n.delete(a.title); return n; })} />
                    {a.title}
                  </label>
                ))}
              </div>
            )}
            {err && <p className="mt-2 text-sm text-rec" role="alert">{err}</p>}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button className="btn-ghost" onClick={() => act("close")} disabled={!!busy} data-testid="close-message">Close without reply</button>
              {canSend ? (
                <button className="btn-primary" onClick={() => act("send", { text, actions: [...picked] })} disabled={!!busy || placeholders > 0 || text.trim().length < 2} data-testid="send-reply">{busy === "send" ? <Spinner /> : <Send size={14} />} Send reply</button>
              ) : (
                <span className="pill bg-sunken text-ink-3">Only {m.assigneeName} can send</span>
              )}
            </div>
          </div>
        )}
      </div>
      <aside className="card space-y-4 self-start p-4 text-sm" data-testid="message-context">
        <div>
          <p className="label">Problems</p>
          <ul className="space-y-0.5">{ctx.problems.map((p) => <li key={p.name}>{p.name} {p.icd10 && <span className="font-mono text-[11px] text-ink-4">{p.icd10}</span>}</li>)}{!ctx.problems.length && <li className="text-ink-4">None listed</li>}</ul>
        </div>
        <div>
          <p className="label">Medications</p>
          <ul className="space-y-0.5">{ctx.medications.map((x) => <li key={x.name}>{[x.name, x.dose, x.frequency].filter(Boolean).join(" ")}</li>)}{!ctx.medications.length && <li className="text-ink-4">None listed</li>}</ul>
        </div>
        {ctx.allergies.length > 0 && <div><p className="label">Allergies</p><p className="text-rec">{ctx.allergies.map((a) => a.substance).join(", ")}</p></div>}
        <div>
          <p className="label">Recent results</p>
          <ul className="space-y-0.5">{ctx.labs.map((l) => <li key={l.name + l.date} className="flex gap-2"><span className="flex-1">{l.name}</span><span className={l.flag === "high" || l.flag === "low" ? "font-medium text-warn" : ""}>{l.value}</span></li>)}{!ctx.labs.length && <li className="text-ink-4">None on file</li>}</ul>
        </div>
        {ctx.lastVisit && (
          <div>
            <p className="label">Last visit · {new Date(ctx.lastVisit.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            <ul className="list-disc space-y-0.5 pl-4 text-ink-2">{ctx.lastVisit.plan.map((p) => <li key={p}>{p}</li>)}</ul>
            {ctx.lastVisit.encounterId && <Link className="mt-1 inline-block text-xs text-brand hover:underline" href={`/encounters/${ctx.lastVisit.encounterId}`}>Open note</Link>}
          </div>
        )}
        {ctx.openTasks.length > 0 && (
          <div>
            <p className="label">Open tasks</p>
            <ul className="space-y-0.5 text-ink-2">{ctx.openTasks.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function LogMessage({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const [pats, setPats] = useState<{ id: string; name: string; mrn: string }[]>([]);
  const [patientId, setPatientId] = useState("");
  const [channel, setChannel] = useState<"phone" | "portal" | "manual">("phone");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && !pats.length) api<{ patients: { id: string; name: string; mrn: string }[] }>("/patients").then((r) => setPats(r.patients));
  }, [open, pats.length]);
  return (
    <Modal open={open} onClose={onClose} title="Log a patient message">
      <div className="space-y-3">
        <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} aria-label="Patient" data-testid="log-patient">
          <option value="">Choose a patient</option>
          {pats.map((p) => <option key={p.id} value={p.id}>{p.name} · MRN {p.mrn}</option>)}
        </select>
        <div className="flex gap-1.5">
          {([["phone", "Phone call"], ["portal", "Portal (pasted)"], ["manual", "Other"]] as const).map(([v, l]) => (
            <button key={v} className={`rounded-lg border px-3 py-1.5 text-sm ${channel === v ? "border-brand bg-brand-50 text-brand" : "border-line"}`} onClick={() => setChannel(v)}>{l}</button>
          ))}
        </div>
        <textarea className="input min-h-[120px] text-sm" placeholder="What did the patient say?" value={body} onChange={(e) => setBody(e.target.value)} data-testid="log-body" />
        {err && <p className="text-sm text-rec" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !patientId || body.trim().length < 2} onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await api<{ message: Message }>("/messages", { body: { patientId, body, channel } });
              setBody("");
              onSaved(r.message.id);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Could not save");
            } finally {
              setBusy(false);
            }
          }} data-testid="log-save"><InboxIcon size={14} /> Add to inbox</button>
        </div>
      </div>
    </Modal>
  );
}
