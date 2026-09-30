import Link from "next/link";
import { Logo } from "@/components/icons";

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/practice" className="flex items-center gap-2" data-testid="practice-home">
          <Logo size={26} />
          <span className="font-serif text-xl">Chartside <span className="text-brand">Practice</span></span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/practice#cases" className="btn-ghost px-2.5 py-1.5">Cases</Link>
          <Link href="/line" className="btn-ghost hidden px-2.5 py-1.5 sm:inline-flex">For clinicians</Link>
        </nav>
      </header>
      <main className="flex-1 px-0 pb-6 sm:px-6">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-center text-xs text-ink-3 sm:px-6">Every patient here is fictional. No real patient information is used, so scorecards are safe to share. Practice is not medical advice.</footer>
    </div>
  );
}
