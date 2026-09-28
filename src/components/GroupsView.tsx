"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Plus, Users } from "./icons";
import { Modal, Spinner, StatusPill } from "./ui";
import type { EncounterStatus } from "@/lib/types";

type Row = { id: string; title: string; members: string[]; encounterId: string; createdAt: string; notes: number; status: EncounterStatus };

export default function GroupsView({ initial, patients }: { initial: Row[]; patients: { id: string; name: string; mrn: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = patients.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.mrn.includes(q));
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Group therapy</h1>
          <p className="mt-1 text-sm text-ink-2">Record one group session and get a separate note for each member. Each note covers the group topic and that member&apos;s own participation, and never names anyone else in the room. Billed as 90853 per member.</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)} data-testid="group-new"><Plus size={14} /> New group session</button>
      </div>
      <ul className="card mt-6 divide-y divide-line" data-testid="group-list">
        {initial.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-sunken" data-testid="group-row">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.title}</p>
                <p className="truncate text-xs text-ink-3">{new Date(g.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {g.members.join(", ")}</p>
              </div>
              <span className="text-xs text-ink-3">{g.notes ? `${g.notes} member notes` : "No member notes yet"}</span>
              <StatusPill status={g.status} />
            </Link>
          </li>
        ))}
        {!initial.length && <li className="flex flex-col items-center gap-2 px-4 py-12 text-sm text-ink-3"><Users size={22} /> No group sessions yet.</li>}
      </ul>
      <Modal open={open} onClose={() => setOpen(false)} title="New group session">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ group: { encounterId: string } }>("/groups", { body: { title: new FormData(e.currentTarget).get("title"), memberIds: picked } });
            router.push(`/encounters/${r.group.encounterId}`);
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not create the group");
            setBusy(false);
          }
        }}>
          <label className="block"><span className="label">Group name</span><input name="title" className="input" required placeholder="Coping skills group" data-testid="group-title" /></label>
          <div>
            <span className="label">Members ({picked.length})</span>
            <input className="input mb-2 text-sm" placeholder="Search patients" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {shown.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} data-testid={`group-member-${p.name.split(" ")[0].toLowerCase()}`} />
                  {p.name} <span className="text-xs text-ink-4">MRN {p.mrn}</span>
                </label>
              ))}
            </div>
          </div>
          {err && <p className="text-sm text-rec" role="alert">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy} data-testid="group-create">{busy ? <Spinner /> : <Plus size={14} />} Create and start recording</button></div>
        </form>
      </Modal>
    </div>
  );
}
