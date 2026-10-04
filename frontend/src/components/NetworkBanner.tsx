// Shown when the page is not on devnet. Contributing is disabled meanwhile.
export function NetworkBanner({ problem }: { problem: string | null }) {
  if (!problem) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
    >
      <strong>Wrong network.</strong> {problem} ReliefPool runs on Solana devnet
      only, so contributing is disabled.
    </div>
  );
}
