import { config } from "../config";
import type { EventData } from "../hooks/useEventData";
import { formatLamportsAsSol, shortAddress } from "../lib/format";
import { paidEvents } from "../lib/payouts";
import { Card } from "./Card";

function confirmedAt(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Confirmed payouts from GET /events?status=paid (docs/api.md section 6),
// each with a link to its transaction. The backend holds the signatures.
export function PayoutHistory({ payouts }: { payouts: EventData["payouts"] }) {
  // Only confirmed payouts have a real amount and transaction: pending ones
  // carry 0, and a failed one may keep payout without anything paid.
  const events = paidEvents(payouts.data?.events ?? []);
  const total = events.reduce(
    (sum, e) => sum + BigInt(e.payout.amountLamports),
    0n
  );

  return (
    <Card
      title="Payout history"
      action={
        events.length > 0 && (
          <span className="text-xs text-muted">
            {formatLamportsAsSol(total)} SOL in {events.length}{" "}
            {events.length === 1 ? "payout" : "payouts"}
          </span>
        )
      }
      hasData={payouts.data !== undefined}
      loading={payouts.loading}
      error={payouts.error}
      updatedAt={payouts.updatedAt}
      onRetry={payouts.refresh}
      empty={events.length === 0}
      emptyMessage="No payouts yet. A payout happens when an event scores at or above the threshold."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Event</th>
              <th className="py-1 pr-3 text-right font-medium">Risk</th>
              <th className="py-1 pr-3 text-right font-medium">Amount</th>
              <th className="py-1 pr-3 font-medium">Confirmed</th>
              <th className="py-1 font-medium">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const payout = e.payout;
              return (
                <tr key={e.id} className="border-t border-border-low">
                  <td className="max-w-56 py-2 pr-3">
                    <p className="truncate" title={e.place}>
                      {e.place}
                    </p>
                    <p className="truncate font-mono text-xs text-muted">
                      {e.id}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {e.riskScore ?? "–"}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                    {formatLamportsAsSol(payout.amountLamports)} SOL
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {confirmedAt(payout.confirmedAt)}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {config.oracleMock ? (
                      <span
                        className="font-mono text-xs text-muted"
                        title="Mock signature, not a real transaction"
                      >
                        {shortAddress(payout.signature)} (mock)
                      </span>
                    ) : (
                      <a
                        className="font-mono text-xs underline"
                        href={payout.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddress(payout.signature)} ↗
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
