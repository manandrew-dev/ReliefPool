// The only module the UI uses to read and write the ReliefPool program
// (docs/api.md section 5). With VITE_ORACLE_MOCK=false it talks to the
// program on devnet (./devnet.ts). Otherwise it serves the mock chain in
// src/mocks/: the oracle fixtures hand out mock pool and vault addresses
// that only exist there, so oracle and chain are mocked together.
//
// Shapes follow docs/api.md section 5.2 with Kit types: public keys are
// Address and u64 values are bigint.

import type { WalletSession } from "@solana/client";
import { config } from "../config";
import {
  applyMockContribution,
  mockContributions,
  mockPool,
  mockPoolAddress,
  mockVaultAddress,
  mockVaultBalance,
  mockWalletBalance,
} from "../mocks/chain";
import * as devnet from "./devnet";
import {
  ProgramError,
  type Address,
  type Contribution,
  type Pool,
} from "./types";

export {
  ProgramError,
  type Address,
  type Contribution,
  type Pool,
  type ProgramErrorCode,
  type Responder,
} from "./types";

// True while this module returns mock data instead of reading the chain.
export const isMock = config.oracleMock;

const MOCK_LATENCY_MS = 150;
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
  if (!isMock) return devnet.getPool(poolAddress);
  assertMockAccount(poolAddress, mockPoolAddress);
  return mockDelay(mockPool);
}

// All Contribution accounts for the pool.
export async function getContributions(
  poolAddress: Address
): Promise<Contribution[]> {
  if (!isMock) return devnet.getContributions(poolAddress);
  assertMockAccount(poolAddress, mockPoolAddress);
  return mockDelay(mockContributions);
}

// Lamport balance of the vault, at the address from GET /pool.
export async function getVaultBalance(vaultAddress: Address): Promise<bigint> {
  if (!isMock) return devnet.getVaultBalance(vaultAddress);
  assertMockAccount(vaultAddress, mockVaultAddress);
  return mockDelay(mockVaultBalance());
}

// Lamport balance of any wallet, e.g. the connected one before contributing.
export async function getWalletBalance(
  walletAddress: Address
): Promise<bigint> {
  if (!isMock) return devnet.getWalletBalance(walletAddress);
  return mockDelay(mockWalletBalance(walletAddress));
}

// Sends the contribute instruction signed by the connected wallet and
// resolves with the transaction signature. On devnet the wallet only signs
// and the app sends through its own devnet RPC (see devnet.ts).
export async function contribute(
  amountLamports: bigint,
  { pool, wallet }: { pool: Address; wallet: WalletSession }
): Promise<string> {
  if (!isMock) return devnet.contribute(amountLamports, { pool, wallet });
  assertMockAccount(pool, mockPoolAddress);
  if (amountLamports <= 0n) {
    throw new ProgramError("ZeroAmount", "Contribution must be more than 0.");
  }

  applyMockContribution(wallet.account.address, amountLamports);

  mockSignatureCount += 1;
  return mockDelay(`mock-contribute-${mockSignatureCount}`);
}
