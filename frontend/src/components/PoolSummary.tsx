import { combineAsync } from "../hooks/useAsyncData";
import { POOL_NOT_DEPLOYED_MESSAGE, type PoolData } from "../hooks/usePoolData";
import { formatLamportsAsSol } from "../lib/format";
import { Card } from "./Card";

function Sol({ lamports }: { lamports: bigint }) {
  return (
    <p
      className="text-2xl font-semibold"
      title={`${formatLamportsAsSol(lamports)} SOL`}
    >
      {formatLamportsAsSol(lamports, 4)}{" "}
      <span className="text-base text-muted">SOL</span>
    </p>
  );
}

// Four stat cards: vault balance, totals and the payout rule. Sources per
// docs/api.md section 6.
export function PoolSummary({ data }: { data: PoolData }) {
  const { info, pool, vaultBalance, notDeployed } = data;
  const notDeployedState = {
    empty: notDeployed,
    emptyMessage: POOL_NOT_DEPLOYED_MESSAGE,
  };
  const vaultState = combineAsync(info, vaultBalance);
  const poolState = combineAsync(info, pool);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card title="Vault balance" {...vaultState} {...notDeployedState}>
        {vaultBalance.data !== undefined && (
          <Sol lamports={vaultBalance.data} />
        )}
        <p className="text-xs text-muted">Held by the program, not a wallet</p>
      </Card>

      <Card title="Total contributed" {...poolState} {...notDeployedState}>
        {pool.data && <Sol lamports={pool.data.totalContributed} />}
      </Card>

      <Card title="Total paid out" {...poolState} {...notDeployedState}>
        {pool.data && <Sol lamports={pool.data.totalPaidOut} />}
      </Card>

      <Card title="Payout rule" {...poolState} {...notDeployedState}>
        {pool.data && info.data && (
          <>
            <p className="text-2xl font-semibold">
              Risk ≥ {pool.data.threshold}
              <span className="text-base text-muted"> / 100</span>
            </p>
            <p className="text-xs text-muted">{info.data.region.name}</p>
          </>
        )}
      </Card>
    </div>
  );
}
