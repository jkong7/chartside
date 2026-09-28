"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function LocationFilter({ locations, selected, mine }: { locations: { id: string; name: string }[]; selected: string | null; mine: string | null }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-6 text-sm md:px-8" data-testid="location-filter">
      <span className="text-ink-3">Location</span>
      <select className="input w-56 py-1.5 text-sm" value={selected ?? ""} onChange={(e) => router.push(e.target.value ? `/today?loc=${e.target.value}` : "/today")} aria-label="Location" data-testid="location-select">
        <option value="">All locations</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      {selected && selected !== mine && <button className="btn-ghost px-2 text-xs" onClick={async () => { await api("/locations/me", { method: "PUT", body: { locationId: selected } }); router.refresh(); }} data-testid="location-make-default">Make this my location</button>}
      {selected && selected === mine && <span className="text-xs text-ink-3">Your location</span>}
    </div>
  );
}
