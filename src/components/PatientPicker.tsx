"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Hit = { id: string; name: string; mrn: string; dob: string };

export default function PatientPicker({ name, id, placeholder = "Search by name or MRN", allowNone = true }: { name: string; id?: string; placeholder?: string; allowNone?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (picked) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await api<{ patients: Hit[] }>(`/patients?q=${encodeURIComponent(q)}&offset=0`).catch(() => ({ patients: [] as Hit[] }));
      if (n === seq.current) setHits(r.patients.slice(0, 8));
    }, 150);
    return () => clearTimeout(t);
  }, [q, picked]);
  return (
    <div className="relative">
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={allowNone ? `${placeholder}, or leave blank to add later` : placeholder}
        value={picked ? `${picked.name} · MRN ${picked.mrn}` : q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setPicked(null); setQ(e.target.value); setOpen(true); }}
        data-testid="patient-picker"
      />
      {open && !picked && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg" role="listbox">
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sunken" onMouseDown={(e) => e.preventDefault()} onClick={() => { setPicked(h); setOpen(false); }} data-testid="patient-option">
                <span>{h.name}</span><span className="text-xs text-ink-3">MRN {h.mrn} · {h.dob}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
