// The only module the UI uses to read and write the ReliefPool program
// (docs/api.md section 5). Everything here is mocked until the program is
// deployed (#8); then replace the bodies with the Codama-generated Kit
// client and keep the exported signatures.
//
// Shapes follow docs/api.md section 5.2 with Kit types instead of the
// web3.js/Anchor ones it lists: PublicKey -> Address, BN -> bigint. That is
// what a Codama client renders for Pubkey and u64.

import { toAddress, type WalletSession } from "@solana/client";
import { mockWallets } from "../mocks/wallets";

export type Address = WalletSession["account"]["address"];

// True while this module returns mock data instead of reading the chain.
export const isMock = true;

export interface Responder {
  wallet: Address;
  shareBps: number;
}

export interface Pool {
  admin: Address;
  oracle: Address;
  regionId: number;
  threshold: number; // 0 to 100
  payoutCapLamports: bigint;
  responders: Responder[]; // max 5
  totalContributed: bigint;
  totalPaidOut: bigint;
}

export interface Contribution {
  pool: Address;
  contributor: Address;
  amount: bigint; // cumulative
}

// Program errors from docs/api.md section 5.4.
export type ProgramErrorCode =
  | "Unauthorized"
  | "TooManyResponders"
  | "InvalidShares"
  | "BelowThreshold"
  | "InsufficientFunds"
  | "ZeroAmount";

export class ProgramError extends Error {
  readonly code: ProgramErrorCode;

  constructor(code: ProgramErrorCode, message: string) {
    super(message);
    this.name = "ProgramError";
    this.code = code;
  }
}

// Mock chain state. Totals line up with the oracle fixtures: one 2 SOL
// payout for replay-major-01, threshold 70.
const SOL = 1_000_000_000n;
// Starting balance of every wallet in mock mode.
const MOCK_WALLET_BALANCE_LAMPORTS = 3n * SOL;
const VAULT_RENT_EXEMPT_LAMPORTS = 890_880n;
const MOCK_LATENCY_MS = 150;

const mockPoolAddress = toAddress(mockWallets.pool);
const mockVaultAddress = toAddress(mockWallets.vault);

const mockPool: Pool = {
  admin: toAddress(mockWallets.admin),
  oracle: toAddress(mockWallets.oracle),
  regionId: 1,
  threshold: 70,
  payoutCapLamports: 2n * SOL,
  responders: [
    { wallet: toAddress(mockWallets.responderA), shareBps: 6000 },
    { wallet: toAddress(mockWallets.responderB), shareBps: 4000 },
  ],
  totalContributed: 8n * SOL,
  totalPaidOut: 2n * SOL,
};

const mockContributions: Contribution[] = [
  {
    pool: mockPoolAddress,
    contributor: toAddress(mockWallets.contributorA),
    amount: 5n * SOL,
  },
  {
    pool: mockPoolAddress,
    contributor: toAddress(mockWallets.contributorB),
    amount: 3n * SOL,
  },
];

const mockWalletSpent = new Map<Address, bigint>();
let mockSignatureCount = 0;

function mockDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(value)), MOCK_LATENCY_MS)
  );
}

function assertMockAccount(actual: Address, expected: Address) {
  if (actual !== expected) {
    throw new Error(`Account ${actual} not found.`);
  }
}

// Pool account at the address from GET /pool.
export async function getPool(poolAddress: Address): Promise<Pool> {
  assertMockAccount(poolAddress, mockPoolAddress);
  return mockDelay(mockPool);
}

// All Contribution accounts for the pool.
export async function getContributions(
  poolAddress: Address
): Promise<Contribution[]> {
  assertMockAccount(poolAddress, mockPoolAddress);
  return mockDelay(mockContributions);
}

// Lamport balance of the vault, at the address from GET /pool.
export async function getVaultBalance(vaultAddress: Address): Promise<bigint> {
  assertMockAccount(vaultAddress, mockVaultAddress);
  return mockDelay(
    mockPool.totalContributed -
      mockPool.totalPaidOut +
      VAULT_RENT_EXEMPT_LAMPORTS
  );
}

// Lamport balance of any wallet, e.g. the connected one before contributing.
export async function getWalletBalance(
  walletAddress: Address
): Promise<bigint> {
  const spent = mockWalletSpent.get(walletAddress) ?? 0n;
  return mockDelay(MOCK_WALLET_BALANCE_LAMPORTS - spent);
}

// Sends the contribute instruction signed by the connected wallet and
// resolves with the transaction signature.
//
// TODO(real client): only sign in the wallet and send through the app's
// devnet RPC, so a wallet set to mainnet cannot send the transaction there.
// Build the signer with createWalletTransactionSigner(wallet) from
// @solana/client and require mode === "partial" (the wallet exposes
// signTransaction). Refuse mode === "send", where the wallet would send the
// transaction itself on whatever network it is set to.
export async function contribute(
  amountLamports: bigint,
  { pool, wallet }: { pool: Address; wallet: WalletSession }
): Promise<string> {
  assertMockAccount(pool, mockPoolAddress);
  if (amountLamports <= 0n) {
    throw new ProgramError("ZeroAmount", "Contribution must be more than 0.");
  }

  const contributor = wallet.account.address;
  const existing = mockContributions.find((c) => c.contributor === contributor);
  if (existing) {
    existing.amount += amountLamports;
  } else {
    mockContributions.push({ pool, contributor, amount: amountLamports });
  }
  mockPool.totalContributed += amountLamports;
  mockWalletSpent.set(
    contributor,
    (mockWalletSpent.get(contributor) ?? 0n) + amountLamports
  );

  mockSignatureCount += 1;
  return mockDelay(`mock-contribute-${mockSignatureCount}`);
}
