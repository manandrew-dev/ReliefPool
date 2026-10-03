import { useWalletConnection } from "@solana/react-hooks";
import { HealthIndicator } from "./components/HealthIndicator";

function WalletControl() {
  const { connectors, connect, disconnect, connected, connecting, wallet } =
    useWalletConnection();

  if (connected && wallet) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{wallet.account.address}</span>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {connectors.map((c) => (
        <button key={c.id} onClick={() => connect(c.id)} disabled={connecting}>
          Connect {c.name}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-low p-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">ReliefPool</h1>
        <HealthIndicator />
      </div>
      <WalletControl />
    </header>
  );
}
