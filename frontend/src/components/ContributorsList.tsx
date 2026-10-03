import { toAddress } from "@solana/client";
import { useWalletConnection } from "@solana/react-hooks";
import { useState } from "react";
import { combineAsync } from "../hooks/useAsyncData";
import type { PoolData } from "../hooks/usePoolData";
import {
  formatBpsAsPercent,
  formatLamportsAsSol,
  labelFor,
  shareOfTotalBps,
} from "../lib/format";
import { Card } from "./Card";
import { ContributeModal } from "./ContributeModal";

// Every Contribution account for the pool, largest first, plus the
// Contribute button.
export function ContributorsList({
  data,
  networkProblem,
}: {
  data: PoolData;
  networkProblem: string | null;
}) {
  const { info, contributions, refreshChain } = data;
  const state = combineAsync(info, contributions);
  const [modalOpen, setModalOpen] = useState(false);
  const { wallet, connected } = useWalletConnection();
  const you = connected ? wallet?.account.address : undefined;

  const rows = [...(contributions.data ?? [])].sort((a, b) =>
    a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1
  );
  const total = rows.reduce((sum, c) => sum + c.amount, 0n);
  const labels = info.data?.labels;
  const poolAddress = info.data?.poolAddress;

  const disabledReason = networkProblem
    ? "Contributing is disabled on the wrong network."
    : !poolAddress
      ? "Pool details have not loaded yet."
      : undefined;

  const action = (
    <button
      className="rounded-md bg-primary px-3 py-1.5 text-sm text-background disabled:opacity-50"
      onClick={() => setModalOpen(true)}
      disabled={disabledReason !== undefined}
      title={disabledReason}
    >
      Contribute
    </button>
  );

  return (
    <>
      <Card
        title="Contributors"
        action={action}
        {...state}
        empty={rows.length === 0}
        emptyMessage="No contributions yet. Be the first."
      >
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {rows.map((c) => (
            <li
              key={c.contributor}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm ${
                c.contributor === you ? "bg-cream" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate" title={c.contributor}>
                  {labelFor(c.contributor, labels)}
                </span>
                {c.contributor === you && (
                  <span className="rounded-full bg-primary px-1.5 text-xs text-background">
                    You
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="font-medium">
                  {formatLamportsAsSol(c.amount, 4)} SOL
                </span>{" "}
                <span className="text-muted">
                  ({formatBpsAsPercent(shareOfTotalBps(c.amount, total))})
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {modalOpen && poolAddress && (
        <ContributeModal
          poolAddress={toAddress(poolAddress)}
          networkProblem={networkProblem}
          onClose={() => setModalOpen(false)}
          onContributed={refreshChain}
        />
      )}
    </>
  );
}
