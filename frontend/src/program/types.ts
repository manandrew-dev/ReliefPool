// Shapes the UI uses for the ReliefPool program (docs/api.md section 5.2),
// shared by the devnet client and the mock chain. Kit types throughout:
// public keys are Address and u64 values are bigint.

import type { WalletSession } from "@solana/client";

export type Address = WalletSession["account"]["address"];

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
  | "ZeroAmount"
  | "InvalidThreshold"
  | "DuplicateResponder";

export class ProgramError extends Error {
  readonly code: ProgramErrorCode;

  constructor(code: ProgramErrorCode, message: string) {
    super(message);
    this.name = "ProgramError";
    this.code = code;
  }
}
