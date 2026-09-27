"use client";

import { useEffect, type ReactNode } from "react";
import type { EncounterStatus } from "@/lib/types";
import { X } from "./icons";

const STATUS: Record<EncounterStatus, { label: string; cls: string; dot: string }> = {
  scheduled: { label: "Ready to record", cls: "bg-sunken text-ink-2", dot: "bg-ink-4" },
  recording: { label: "Recording", cls: "bg-rec-50 text-rec", dot: "bg-rec animate-pulse" },
  paused: { label: "Paused", cls: "bg-warn-50 text-warn", dot: "bg-warn" },
  processing: { label: "Drafting note", cls: "bg-info-50 text-info", dot: "bg-info animate-pulse" },
  review: { label: "Ready for review", cls: "bg-brand-50 text-brand", dot: "bg-brand" },
  signed: { label: "Signed", cls: "bg-ok-50 text-ok", dot: "bg-ok" },
};

export function StatusPill({ status }: { status: EncounterStatus }) {
  const s = STATUS[status];
  return (
    <span className={`pill whitespace-nowrap ${s.cls}`} data-status={status}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-label="Loading" />;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${value === t.id ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"} shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost -mr-2 px-2" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium text-ink-2">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "ink" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ink" | "brand" | "warn" | "ok" }) {
  const color = { ink: "text-ink", brand: "text-brand", warn: "text-warn", ok: "text-ok" }[tone];
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1 font-serif text-3xl ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Toast({ message, tone = "ink", onDone }: { message: string | null; tone?: "ink" | "rec" | "ok"; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  const bg = { ink: "bg-ink", rec: "bg-rec", ok: "bg-ok" }[tone];
  return (
    <div role="status" className={`fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${bg}`}>
      {message}
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const hue = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ width: size, height: size, background: `hsl(${hue} 38% 42%)` }} aria-hidden>
      {initials}
    </span>
  );
}
