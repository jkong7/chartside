"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { roleLabel, type Role } from "@/lib/roles";
import { Bed, Calendar, Chart, Check, Gear, Inbox, Layout, Logo, Logout, Receipt, Shield, Users } from "./icons";
import { Avatar } from "./ui";

const NAV: { href: string; label: string; icon: typeof Calendar; roles?: Role[] }[] = [
  { href: "/today", label: "Today", icon: Calendar },
  { href: "/hospital", label: "Hospital", icon: Bed, roles: ["owner", "admin", "clinician", "nurse", "scribe", "viewer"] },
  { href: "/inbox", label: "Inbox", icon: Inbox, roles: ["owner", "admin", "clinician", "scribe"] },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/scheduling", label: "Scheduling", icon: Calendar, roles: ["owner", "admin", "clinician", "scribe"] },
  { href: "/templates", label: "Templates", icon: Layout, roles: ["owner", "admin", "clinician", "scribe"] },
  { href: "/revenue", label: "Revenue", icon: Receipt, roles: ["owner", "admin", "clinician", "coder", "viewer"] },
  { href: "/quality", label: "Quality", icon: Check, roles: ["owner", "admin", "clinician", "coder", "viewer"] },
  { href: "/insights", label: "Insights", icon: Chart, roles: ["owner", "admin", "clinician", "viewer"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["owner", "admin"] },
  { href: "/settings", label: "Settings", icon: Gear },
];

export interface SidebarUser {
  name: string;
  specialty: string;
  role: Role;
  orgId: string;
  orgName: string;
  orgs: { id: string; name: string; role: Role }[];
}

const navFor = (role: Role) => NAV.filter((n) => !n.roles || n.roles.includes(role));

function useInboxCount(enabled: boolean) {
  const path = usePathname();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => api<{ count: number }>("/inbox/count").then((r) => alive && setN(r.count)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled, path]);
  return n;
}

function OrgSwitcher({ user }: { user: SidebarUser }) {
  const router = useRouter();
  if (user.orgs.length < 2) {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-line px-3 py-2" data-testid="org-name">
        <p className="truncate text-sm font-medium">{user.orgName}</p>
        <p className="text-[11px] text-ink-3">{roleLabel(user.role)}</p>
      </div>
    );
  }
  return (
    <div className="mx-3 mb-3">
      <label className="sr-only" htmlFor="org-switch">Organization</label>
      <select
        id="org-switch"
        className="input py-1.5 text-sm"
        data-testid="org-switch"
        value={user.orgId}
        onChange={async (e) => {
          await api("/orgs/switch", { body: { orgId: e.target.value } });
          router.push("/today");
          router.refresh();
        }}
      >
        {user.orgs.map((o) => <option key={o.id} value={o.id}>{o.name} · {roleLabel(o.role)}</option>)}
      </select>
    </div>
  );
}

export default function Sidebar({ user, engine }: { user: SidebarUser; engine: string }) {
  const path = usePathname();
  const router = useRouter();
  const inbox = useInboxCount(["owner", "admin", "clinician", "scribe"].includes(user.role));
  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-line bg-surface md:flex">
      <Link href="/today" className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={26} />
        <span className="font-serif text-xl">Chartside</span>
      </Link>
      <OrgSwitcher user={user} />
      <nav className="flex-1 space-y-0.5 px-3" data-testid="nav">
        {navFor(user.role).map((n) => {
          const active = path.startsWith(n.href) || (n.href === "/today" && path.startsWith("/encounters"));
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-sunken"}`}>
              <Icon size={17} />
              {n.label}
              {n.href === "/inbox" && inbox > 0 && <span className="ml-auto rounded-full bg-rec px-1.5 text-[10px] font-semibold text-white" data-testid="inbox-count">{inbox}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mx-3 mb-3 rounded-lg bg-sunken px-3 py-2 text-[11px] text-ink-3" data-testid="engine-badge">
        Engine: <span className="font-medium text-ink-2">{engine}</span>
      </div>
      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
        <Avatar name={user.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-ink-3">{user.role === "clinician" || user.role === "owner" || user.role === "admin" ? user.specialty : roleLabel(user.role)}</p>
        </div>
        <button
          className="btn-ghost px-2"
          aria-label="Sign out"
          onClick={async () => {
            await api("/auth/logout", { method: "POST" });
            router.push("/login");
            router.refresh();
          }}
        >
          <Logout />
        </button>
      </div>
    </aside>
  );
}

export function MobileNav({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:hidden" aria-label="Main">
      <Link href="/today" className="mr-1 shrink-0"><Logo size={24} /></Link>
      {navFor(role).map((n) => {
        const Icon = n.icon;
        const active = path.startsWith(n.href) || (n.href === "/today" && path.startsWith("/encounters"));
        return (
          <Link key={n.href} href={n.href} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${active ? "bg-brand-50 text-brand" : "text-ink-2"}`}>
            <Icon size={15} /> {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
