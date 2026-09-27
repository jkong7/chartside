"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Calendar, Chart, Gear, Layout, Logo, Logout, Receipt, Users } from "./icons";
import { Avatar } from "./ui";

const NAV = [
  { href: "/today", label: "Today", icon: Calendar },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/templates", label: "Templates", icon: Layout },
  { href: "/revenue", label: "Revenue", icon: Receipt },
  { href: "/insights", label: "Insights", icon: Chart },
  { href: "/settings", label: "Settings", icon: Gear },
];

export default function Sidebar({ user, engine }: { user: { name: string; specialty: string }; engine: string }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-line bg-surface md:flex">
      <Link href="/today" className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={26} />
        <span className="font-serif text-xl">Chartside</span>
      </Link>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((n) => {
          const active = path.startsWith(n.href) || (n.href === "/today" && path.startsWith("/encounters"));
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-sunken"}`}>
              <Icon size={17} />
              {n.label}
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
          <p className="truncate text-xs text-ink-3">{user.specialty}</p>
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

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:hidden" aria-label="Main">
      <Link href="/today" className="mr-1 shrink-0"><Logo size={24} /></Link>
      {NAV.map((n) => {
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
