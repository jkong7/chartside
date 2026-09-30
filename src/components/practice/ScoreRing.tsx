export function scoreTone(score: number) {
  return score >= 85 ? "#22683f" : score >= 70 ? "#0f6b5c" : score >= 50 ? "#8a5a12" : "#b8322b";
}

export default function ScoreRing({ score, size = 148, label = "Overall" }: { score: number; size?: number; label?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} score ${score} out of 100`} data-testid="score-ring">
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2ddd2" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={scoreTone(pct)} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-5xl leading-none" style={{ color: scoreTone(pct) }} data-testid="score-overall">{score}</span>
        <span className="mt-1 text-xs uppercase tracking-wide text-ink-3">{label}</span>
      </div>
    </div>
  );
}
