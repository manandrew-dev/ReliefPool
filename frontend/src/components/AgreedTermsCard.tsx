import { combineAsync } from "../hooks/useAsyncData";
import { POOL_NOT_DEPLOYED_MESSAGE, type PoolData } from "../hooks/usePoolData";
import {
  formatBpsAsPercent,
  formatLamportsAsSol,
  labelFor,
} from "../lib/format";
import { Card } from "./Card";

// One color per responder slot; a pool has at most 5 (FR-4).
const SLOT_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
];

// The terms partners agreed to before any event: who receives a payout,
// their shares, and when a payout happens. From the Pool account, with
// display names from GET /pool.
export function AgreedTermsCard({ data }: { data: PoolData }) {
  const { info, pool } = data;
  const state = combineAsync(info, pool);
  const responders = pool.data?.responders ?? [];
  const totalBps = responders.reduce((sum, r) => sum + r.shareBps, 0);
  const labels = info.data?.labels;

  return (
    <Card
      title="Agreed terms"
      {...state}
      empty={data.notDeployed || responders.length === 0}
      emptyMessage={
        data.notDeployed
          ? POOL_NOT_DEPLOYED_MESSAGE
          : "No responders registered yet. Payouts are blocked until responder shares total 100%."
      }
    >
      {pool.data && info.data && (
        <>
          <p className="text-sm">
            When an earthquake in {info.data.region.name} scores{" "}
            <strong>{pool.data.threshold} or higher</strong>, the pool pays up
            to{" "}
            <strong>
              {formatLamportsAsSol(pool.data.payoutCapLamports)} SOL
            </strong>{" "}
            per event, split automatically:
          </p>

          <div
            className="flex h-3 overflow-hidden rounded-full bg-cream"
            aria-hidden="true"
          >
            {responders.map((r, i) => (
              <div
                key={r.wallet}
                className={SLOT_COLORS[i % SLOT_COLORS.length]}
                style={{ width: `${(r.shareBps / 10_000) * 100}%` }}
              />
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {responders.map((r, i) => (
              <li
                key={r.wallet}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${SLOT_COLORS[i % SLOT_COLORS.length]}`}
                  />
                  <span className="truncate" title={r.wallet}>
                    {labelFor(r.wallet, labels)}
                  </span>
                </span>
                <span className="font-medium">
                  {formatBpsAsPercent(r.shareBps)}
                </span>
              </li>
            ))}
          </ul>

          {totalBps !== 10_000 && (
            <p className="text-sm text-amber-700">
              Shares total {formatBpsAsPercent(totalBps)}, not 100%. Payouts
              will be rejected until they are fixed.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
