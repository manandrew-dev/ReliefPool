import { HealthIndicator } from "./components/HealthIndicator";
import { MockBadge } from "./components/MockBadge";
import { NetworkBanner } from "./components/NetworkBanner";
import { PoolSummary } from "./components/PoolSummary";
import { WalletButton } from "./components/WalletButton";
import { useEventData } from "./hooks/useEventData";
import { useNetworkProblem } from "./hooks/useNetworkProblem";
import { usePoolData } from "./hooks/usePoolData";

export default function App() {
  const poolData = usePoolData();
  // A new payout changes the vault and totals, so refresh chain data then.
  useEventData(poolData.refreshChain);
  const networkProblem = useNetworkProblem(poolData.info.data);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-low p-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-semibold">ReliefPool</h1>
          <HealthIndicator />
          <MockBadge />
        </div>
        <WalletButton />
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        <NetworkBanner problem={networkProblem} />
        <PoolSummary data={poolData} />
      </main>
    </>
  );
}
