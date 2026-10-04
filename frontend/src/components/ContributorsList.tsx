import { toAddress } from "@solana/client";
import { useWalletConnection } from "@solana/react-hooks";
import { useState } from "react";
import { combineAsync } from "../hooks/useAsyncData";
import { POOL_NOT_DEPLOYED_MESSAGE, type PoolData } from "../hooks/usePoolData";
import {
  apportionBps,
  formatBpsAsPercent,
  formatLamportsAsSol,
  labelFor,
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
  const sharesBps = apportionBps(rows.map((c) => c.amount));
  const labels = info.data?.labels;
  const poolAddress = info.data?.poolAddress;

  const disabledReason = networkProblem
    ? "Contributing is disabled on the wrong network."
    : data.notDeployed
      ? "Pool not deployed yet."
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
        empty={data.notDeployed || rows.length === 0}
        emptyMessage={
          data.notDeployed
            ? POOL_NOT_DEPLOYED_MESSAGE
            : "No contributions yet. Be the first."
        }
      >
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {rows.map((c, i) => (
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
                  ({formatBpsAsPercent(sharesBps[i])})
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
