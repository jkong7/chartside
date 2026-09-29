import Link from "next/link";

export default function LineChecklist({ phone, pin }: { phone: boolean; pin: boolean }) {
  if (phone && pin) return null;
  const steps = [
    { done: phone, label: "Verify your phone", detail: "So the line knows it's you when you call.", href: "/go/settings" },
    { done: pin, label: "Pick a 4 to 6 digit PIN", detail: "Unlocks your schedule and chart questions on a call.", href: "/go/settings" },
    { done: false, label: "Save Chartside to your contacts", detail: "Then just call before a visit.", href: "/line/contact.vcf" },
  ];
  return (
    <section className="card mx-auto w-full max-w-md p-5" data-testid="line-checklist">
      <p className="text-xs font-medium uppercase tracking-wide text-brand">Set up your line · 2 minutes</p>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-3" data-done={s.done}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? "bg-ok text-white" : "border border-line-strong text-ink-3"}`} aria-hidden>
              {s.done ? "✓" : i + 1}
            </span>
            <span className="min-w-0">
              {s.done ? (
                <span className="text-ink-3 line-through">{s.label}</span>
              ) : (
                <Link href={s.href} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:text-brand">
                  {s.label}
                </Link>
              )}
              <span className="block text-sm text-ink-3">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
