type Snapshot = { patient: { name: string; dob: string; sex: string; mrn: string } | null; clinician: string; date: string; reason: string; status: string; signedAt: string | null; noteText: string; addenda: { kind: string; text: string; author: string | null; at: string }[] };

export default function SharedNote({ s, from, message, banner, footer }: { s: Snapshot; from?: string; message?: string; banner: string; footer?: { written: string; tryUrl: string; demoUrl: string } | null }) {
  return (
    <article className="card p-5 md:p-7" data-testid="shared-note">
      <p className="text-xs text-ink-3" data-testid="shared-banner">{banner}</p>
      <h1 className="mt-2 font-serif text-2xl">{s.patient ? s.patient.name : "Visit note"}</h1>
      <p className="text-sm text-ink-2">{s.patient ? `DOB ${s.patient.dob} · ${s.patient.sex} · MRN ${s.patient.mrn} · ` : ""}{new Date(s.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · {s.clinician}</p>
      <p className="mt-1 text-xs text-ink-3">{s.status === "signed" && s.signedAt ? `Signed ${new Date(s.signedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : "Draft, not yet signed"}{s.reason ? ` · ${s.reason}` : ""}</p>
      {message && <blockquote className="mt-4 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">{from ? `${from}: ` : ""}{message}</blockquote>}
      <pre className="mt-5 whitespace-pre-wrap font-sans text-sm leading-relaxed" data-testid="shared-note-text">{s.noteText || "No note yet."}</pre>
      {s.addenda.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          {s.addenda.map((a) => <p key={a.at} className="text-sm"><span className="font-medium capitalize">{a.kind.replace("_", " ")}</span> by {a.author ?? "clinician"}, {new Date(a.at).toLocaleDateString("en-US")}: {a.text}</p>)}
        </div>
      )}
      {footer && (
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm text-ink-3" data-testid="shared-footer">
          <span>{footer.written}.</span>
          <span><a className="font-medium text-brand" href={footer.tryUrl} data-testid="shared-try">Try it on your next patient</a> · <a className="text-brand" href={footer.demoUrl}>Call the demo line</a></span>
        </footer>
      )}
    </article>
  );
}
