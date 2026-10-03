import { HealthIndicator } from "./components/HealthIndicator";
import { MockBadge } from "./components/MockBadge";
import { WalletButton } from "./components/WalletButton";

export default function App() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-low p-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">ReliefPool</h1>
        <HealthIndicator />
        <MockBadge />
      </div>
      <WalletButton />
    </header>
  );
}
