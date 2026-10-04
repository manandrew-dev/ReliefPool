import type { QuakeEvent } from "../api/types";
import type { EventData } from "../hooks/useEventData";
import { formatLamportsAsSol, formatRelativeTime } from "../lib/format";
import { Card } from "./Card";
import { RiskScoreBar } from "./RiskScoreBar";
import { StatusBadge } from "./StatusBadge";

function quakeDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function EventRow({ event }: { event: QuakeEvent }) {
  return (
    <li className="flex flex-col gap-2 border-t border-border-low pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium" title={event.place}>
            {event.place}
          </p>
          <p className="text-xs text-muted">
            M{event.magnitude.toFixed(1)} · {event.depthKm.toFixed(0)} km deep ·{" "}
            {event.source === "replay"
              ? `Replay of ${quakeDate(event.time)}`
              : formatRelativeTime(event.time)}{" "}
            · scored {formatRelativeTime(event.processedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {event.source === "replay" && (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              Replay
            </span>
          )}
          <StatusBadge status={event.status} />
        </div>
      </div>

      <RiskScoreBar score={event.riskScore} threshold={event.threshold} />

      {/* Amounts only once paid: while pending amountLamports is 0
          (api.md 3.1), and a failed payout sent nothing. */}
      {event.status === "paid" && event.payout && (
        <p className="text-xs text-muted">
          Paid {formatLamportsAsSol(event.payout.amountLamports)} SOL to
          responders
        </p>
      )}
      {event.status === "failed" && event.failureReason && (
        <p className="text-xs text-red-600">{event.failureReason}</p>
      )}
    </li>
  );
}

// In-region earthquakes, newest first, with their risk score against the
// threshold and what happened (docs/api.md section 3.4). Polled every 4 s.
export function EventFeed({ feed }: { feed: EventData["feed"] }) {
  const events = feed.data?.events ?? [];
  return (
    <Card
      title="Earthquake feed"
      hasData={feed.data !== undefined}
      loading={feed.loading}
      error={feed.error}
      updatedAt={feed.updatedAt}
      onRetry={feed.refresh}
      empty={events.length === 0}
      emptyMessage="No in-region earthquakes yet. Replay one from the demo panel to see how scoring works."
    >
      <ul className="flex flex-col gap-3">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
    </Card>
  );
}
