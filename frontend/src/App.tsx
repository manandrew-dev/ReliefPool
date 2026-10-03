import { useWalletConnection } from "@solana/react-hooks";

export default function App() {
  const { connectors, connect, disconnect, connected, connecting, wallet } =
    useWalletConnection();

  if (connected && wallet) {
    return (
      <div className="p-4">
        <p className="font-mono">{wallet.account.address}</p>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="p-4">
      {connectors.map((c) => (
        <button key={c.id} onClick={() => connect(c.id)} disabled={connecting}>
          Connect {c.name}
        </button>
      ))}
    </div>
  );
}
