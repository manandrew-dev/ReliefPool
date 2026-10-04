import { useWalletModalState } from "@solana/react-hooks";
import { shortAddress } from "../lib/format";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Wallet connection failed.";
}

// Always rendered, even when no wallet was discovered, so there is a visible
// entry point. Wallets come from autoDiscover() in providers.tsx.
export function WalletButton() {
  const modal = useWalletModalState();

  if (modal.connected && modal.wallet) {
    const address = modal.wallet.account.address;
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm" title={address}>
          {shortAddress(address)}
        </span>
        <button
          className="rounded-md border border-border px-3 py-1.5 text-sm"
          onClick={() => modal.disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className="rounded-md bg-primary px-3 py-1.5 text-sm text-background disabled:opacity-60"
        onClick={modal.toggle}
        disabled={modal.connecting}
        aria-expanded={modal.isOpen}
      >
        {modal.connecting ? "Connecting…" : "Connect wallet"}
      </button>

      {modal.isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-lg border border-border bg-card p-2 shadow-lg">
          {modal.connectors.length === 0 ? (
            <p className="p-2 text-sm text-muted">
              No Solana wallet detected. Install Phantom (phantom.com), switch
              it to devnet, then reload this page.
            </p>
          ) : (
            modal.connectors.map((c) => (
              <button
                key={c.id}
                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-cream"
                onClick={() => modal.connect(c.id)}
              >
                {c.icon && <img src={c.icon} alt="" className="size-5" />}
                {c.name}
              </button>
            ))
          )}
          {modal.error != null && (
            <p className="p-2 text-sm text-red-600">
              {errorMessage(modal.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
