"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { TASK_LABEL } from "@/lib/engine/tasks";
import type { Task } from "@/lib/server/inbox";
import { Check, Plus, X } from "../icons";

export default function TasksPanel({ encounterId, tasks, editable, onChange, onCite }: { encounterId: string; tasks: Task[]; editable: boolean; onChange: () => void; onCite: (ids: string[]) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const open = tasks.filter((t) => t.status === "open");
  const closed = tasks.filter((t) => t.status !== "open");

  async function set(t: Task, status: Task["status"]) {
    await api(`/tasks/${t.id}`, { method: "PATCH", body: { status } });
    onChange();
  }

  return (
    <div className="space-y-4" data-testid="tasks-panel">
      <p className="text-sm text-ink-2">Follow-ups, results to review, referrals, paperwork, and callbacks found in this visit. They go to the treating clinician&apos;s inbox and close the loop after the visit.</p>
      <ul className="card divide-y divide-line">
        {open.map((t) => (
          <li key={t.id} className="flex items-start gap-3 px-4 py-3" data-testid="visit-task">
            {editable && <button className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong hover:border-brand" aria-label={`Mark ${t.title} done`} onClick={() => set(t, "done")}><Check size={12} className="text-transparent hover:text-brand" /></button>}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              <p className="mt-0.5 text-xs text-ink-3"><span className="pill bg-sunken text-[10px]">{TASK_LABEL[t.kind]}</span> {t.detail}</p>
              {t.evidence.length > 0 && <button className="mt-1 text-xs font-medium text-brand" onClick={() => onCite(t.evidence)}>Show in transcript</button>}
            </div>
            {t.dueAt && <span className="whitespace-nowrap text-xs text-ink-3">Due {new Date(t.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            {editable && <button className="btn-ghost px-1.5" aria-label="Dismiss" onClick={() => set(t, "dismissed")}><X size={13} /></button>}
          </li>
        ))}
        {!open.length && <li className="px-4 py-6 text-center text-sm text-ink-3">No open tasks from this visit.</li>}
      </ul>
      {editable && (
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; await api("/tasks", { body: { encounterId, title, dueAt: due || undefined } }); setTitle(""); setDue(""); onChange(); }}>
          <input className="input min-w-[220px] flex-1 text-sm" placeholder="Add a task, e.g. Call with MRI result" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="task-title" />
          <input className="input w-40 text-sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <button className="btn-outline" data-testid="task-add"><Plus size={14} /> Add</button>
        </form>
      )}
      {closed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-ink-3">{closed.length} completed or dismissed</summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-3">{closed.map((t) => <li key={t.id} className="flex gap-2"><span className="line-through">{t.title}</span>{editable && <button className="text-xs text-brand" onClick={() => set(t, "open")}>Reopen</button>}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
