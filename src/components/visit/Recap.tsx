import type { VisitRecap } from "@/lib/engine/visitRecap";

function Section({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="border-t border-line pt-4 first:border-0 first:pt-0" data-testid={testid}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Dots({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Recap({ recap }: { recap: VisitRecap }) {
  return (
    <div className="card space-y-5 p-5 text-[17px] leading-7 sm:p-6" data-testid="visit-recap">
      <p className="font-serif text-2xl leading-snug text-ink" data-testid="visit-headline">{recap.headline}</p>
      {!!recap.discussed.length && <Section title="What you talked about"><Dots items={recap.discussed} /></Section>}
      {!!recap.diagnoses.length && (
        <Section title="Diagnoses in plain words" testid="visit-diagnoses">
          <ul className="space-y-1.5">
            {recap.diagnoses.map((d) => (
              <li key={d.term}><span className="font-medium text-ink">{d.plain[0].toUpperCase() + d.plain.slice(1)}</span> <span className="text-sm text-ink-3">(your chart may say &quot;{d.term}&quot;)</span></li>
            ))}
          </ul>
        </Section>
      )}
      {!!recap.meds.length && (
        <Section title="Your medicines" testid="visit-meds">
          <ul className="space-y-2">
            {recap.meds.map((m) => (
              <li key={`${m.name}:${m.change}`} className="flex items-start gap-2.5">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${m.change === "Keep taking" ? "bg-sunken text-ink-3" : "bg-brand-50 text-brand"}`}>{m.change}</span>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!!recap.nextSteps.length && (
        <Section title="What to do next" testid="visit-next">
          <ul className="space-y-2">
            {recap.nextSteps.map((n) => (
              <li key={n.text} className="flex items-start gap-2.5">
                <span className="mt-1 h-4 w-4 shrink-0 rounded border-2 border-brand/60" aria-hidden />
                <span>{n.text}{n.when && <span className="block text-sm font-medium text-brand">{n.when[0].toUpperCase() + n.when.slice(1)}</span>}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!!recap.questions.length && <Section title="Questions to ask next time" testid="visit-questions"><Dots items={recap.questions} /></Section>}
      {!!recap.watchFor.length && (
        <Section title="Get help right away if">
          <div className="rounded-lg bg-rec-50 p-3 text-base text-ink"><Dots items={recap.watchFor} /></div>
        </Section>
      )}
      <p className="text-xs text-ink-3">Written by a computer from what it heard. It can make mistakes. This is not your medical record, so ask your clinician if anything looks wrong.</p>
    </div>
  );
}

export function RecapFooter() {
  return (
    <footer className="mt-10 border-t border-line pt-4 text-xs text-ink-3" data-testid="visit-footer">
      <p>Recorded with Chartside. <a className="font-medium text-brand" href="/line?src=patient_visit" data-testid="visit-footer-cta">Clinicians: get this note as a draft, free.</a></p>
      <p className="mt-1">Want this for your next visit? <a className="text-brand" href="/visit">Record a visit</a></p>
    </footer>
  );
}
