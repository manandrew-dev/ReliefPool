// Mock chain state shared by the mock program client and the mock oracle,
// so a mock payout moves money the same way trigger_payout would: out of
// the vault, into the responders' wallets, and into totalPaidOut.
// Starting totals line up with the oracle fixtures: one 0.1 SOL payout for
// tohoku-2011-m91, threshold 70. Pool values match the demo pool in
// api.md 5.6: 0.1 SOL payout cap, three contributors of about 0.5 SOL.

import { toAddress } from "@solana/client";
import type { Address, Contribution, Pool } from "../program/client";
import { mockWallets } from "./wallets";

const SOL = 1_000_000_000n;
export const VAULT_RENT_EXEMPT_LAMPORTS = 890_880n;
// Starting balance of every wallet in mock mode; contributors hold about
// 1 devnet SOL in the demo setup (api.md 5.6).
const MOCK_WALLET_BALANCE_LAMPORTS = 1n * SOL;

export const mockPoolAddress = toAddress(mockWallets.pool);
export const mockVaultAddress = toAddress(mockWallets.vault);

export const mockPool: Pool = {
  admin: toAddress(mockWallets.admin),
  oracle: toAddress(mockWallets.oracle),
  regionId: 1,
  threshold: 70,
  payoutCapLamports: 100_000_000n, // 0.1 SOL
  responders: [
    { wallet: toAddress(mockWallets.responderA), shareBps: 6000 },
    { wallet: toAddress(mockWallets.responderB), shareBps: 4000 },
  ],
  totalContributed: 1_500_000_000n,
  totalPaidOut: 100_000_000n,
};

export const mockContributions: Contribution[] = [
  {
    pool: mockPoolAddress,
    contributor: toAddress(mockWallets.contributorA),
    amount: 500_000_000n,
  },
  {
    pool: mockPoolAddress,
    contributor: toAddress(mockWallets.contributorB),
    amount: 500_000_000n,
  },
  {
    pool: mockPoolAddress,
    contributor: toAddress(mockWallets.contributorC),
    amount: 500_000_000n,
  },
];

let vaultLamports =
  mockPool.totalContributed -
  mockPool.totalPaidOut +
  VAULT_RENT_EXEMPT_LAMPORTS;

// Net change to each wallet's starting balance.
const walletDeltas = new Map<Address, bigint>();

export function mockVaultBalance(): bigint {
  return vaultLamports;
}

export function mockWalletBalance(wallet: Address): bigint {
  return MOCK_WALLET_BALANCE_LAMPORTS + (walletDeltas.get(wallet) ?? 0n);
}

function adjustWallet(wallet: Address, delta: bigint) {
  walletDeltas.set(wallet, (walletDeltas.get(wallet) ?? 0n) + delta);
}

export function applyMockContribution(contributor: Address, amount: bigint) {
  const existing = mockContributions.find((c) => c.contributor === contributor);
  if (existing) {
    existing.amount += amount;
  } else {
    mockContributions.push({ pool: mockPoolAddress, contributor, amount });
  }
  mockPool.totalContributed += amount;
  vaultLamports += amount;
  adjustWallet(contributor, -amount);
}

export type MockPayoutQuote =
  // gross is what is split; amount is what responders receive in total.
  { ok: true; gross: bigint; amount: bigint } | { ok: false; reason: string };

function splitShares(gross: bigint): { wallet: Address; share: bigint }[] {
  return mockPool.responders.map((r) => ({
    wallet: r.wallet,
    share: (gross * BigInt(r.shareBps)) / 10_000n,
  }));
}

// What trigger_payout would pay right now (#7): min(cap, vault minus the
// rent-exempt minimum), split by shares, with rounding leftovers staying in
// the vault. The amount is the sum actually sent to responders.
export function quoteMockPayout(): MockPayoutQuote {
  const totalBps = mockPool.responders.reduce((sum, r) => sum + r.shareBps, 0);
  if (totalBps !== 10_000) {
    return {
      ok: false,
      reason: "InvalidShares",
    };
  }
  const available = vaultLamports - VAULT_RENT_EXEMPT_LAMPORTS;
  const gross =
    available < mockPool.payoutCapLamports
      ? available
      : mockPool.payoutCapLamports;
  const amount = splitShares(gross).reduce((sum, s) => sum + s.share, 0n);
  if (amount <= 0n) {
    return {
      ok: false,
      reason: "InsufficientFunds",
    };
  }
  return { ok: true, gross, amount };
}

// Confirms a payout quoted earlier from its gross amount. Re-checks the
// vault, since another payout may have confirmed in between, and returns
// null without moving any money if it can no longer cover the payout.
// Otherwise returns the total sent to responders.
export function applyMockPayout(gross: bigint): bigint | null {
  const shares = splitShares(gross);
  const paid = shares.reduce((sum, s) => sum + s.share, 0n);
  if (vaultLamports - VAULT_RENT_EXEMPT_LAMPORTS < paid) return null;
  for (const { wallet, share } of shares) adjustWallet(wallet, share);
  vaultLamports -= paid;
  mockPool.totalPaidOut += paid;
  return paid;
}
