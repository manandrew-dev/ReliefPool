// Risk score on a 0-100 track, with a marker at the threshold that applied
// when the event was scored (QuakeEvent.threshold, not today's threshold).
export function RiskScoreBar({
  score,
  threshold,
}: {
  score: number | null;
  threshold: number;
}) {
  const triggered = score !== null && score >= threshold;
  const label =
    score === null
      ? `No risk score. Threshold ${threshold} of 100.`
      : `Risk score ${score} of 100, threshold ${threshold}${triggered ? ", at or above threshold" : ", below threshold"}.`;

  return (
    <div className="flex items-center gap-3" role="img" aria-label={label}>
      <span className="w-20 shrink-0 text-sm whitespace-nowrap tabular-nums">
        {score === null ? (
          <span className="text-muted">No score</span>
        ) : (
          <>
            <span className="font-semibold">{score}</span>
            <span className="text-muted"> / 100</span>
          </>
        )}
      </span>
      <div className="relative h-2.5 flex-1 rounded-full bg-cream">
        {score !== null && (
          <div
            className={`h-full rounded-full ${triggered ? "bg-red-500" : "bg-sky-500"}`}
            style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
          />
        )}
        <div
          className="absolute -top-1 -bottom-1 w-0.5 bg-foreground"
          style={{ left: `calc(${threshold}% - 1px)` }}
          title={`Threshold ${threshold}`}
        />
      </div>
      <span className="w-10 shrink-0 text-xs text-muted tabular-nums">
        ≥ {threshold}
      </span>
    </div>
  );
}
