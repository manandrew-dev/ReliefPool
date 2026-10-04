import {
  RELIEFPOOL_ERROR__BELOW_THRESHOLD,
  RELIEFPOOL_ERROR__DUPLICATE_RESPONDER,
  RELIEFPOOL_ERROR__INSUFFICIENT_FUNDS,
  RELIEFPOOL_ERROR__INVALID_SHARES,
  RELIEFPOOL_ERROR__INVALID_THRESHOLD,
  RELIEFPOOL_ERROR__TOO_MANY_RESPONDERS,
  RELIEFPOOL_ERROR__UNAUTHORIZED,
  RELIEFPOOL_ERROR__ZERO_AMOUNT,
} from "./generated";
import { ProgramError, type ProgramErrorCode } from "./types";

// Custom error numbers from the IDL, mapped to the names in docs/api.md
// section 5.4 that src/lib/errors.ts turns into readable text.
const PROGRAM_ERROR_CODES: Record<number, ProgramErrorCode> = {
  [RELIEFPOOL_ERROR__UNAUTHORIZED]: "Unauthorized",
  [RELIEFPOOL_ERROR__TOO_MANY_RESPONDERS]: "TooManyResponders",
  [RELIEFPOOL_ERROR__INVALID_SHARES]: "InvalidShares",
  [RELIEFPOOL_ERROR__BELOW_THRESHOLD]: "BelowThreshold",
  [RELIEFPOOL_ERROR__INSUFFICIENT_FUNDS]: "InsufficientFunds",
  [RELIEFPOOL_ERROR__ZERO_AMOUNT]: "ZeroAmount",
  [RELIEFPOOL_ERROR__INVALID_THRESHOLD]: "InvalidThreshold",
  [RELIEFPOOL_ERROR__DUPLICATE_RESPONDER]: "DuplicateResponder",
};

// The System Program's code when a transfer would leave the sender
// negative. Inside contribute it means the wallet can't cover the amount.
const SYSTEM_INSUFFICIENT_LAMPORTS = 1;

const NO_SOL_MESSAGE =
  "Your wallet doesn't have enough devnet SOL for this contribution and its fees.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Turns a transaction error from the RPC (simulation or signature status)
// into an Error the UI can show. Only the contribute transaction comes
// through here, and it has a single instruction, so any custom code in it
// is either the ReliefPool program's or, from its transfer, the System
// Program's.
export function toTransactionError(err: unknown): Error {
  if (err === "InsufficientFundsForFee" || err === "AccountNotFound") {
    return new Error(NO_SOL_MESSAGE);
  }
  if (isRecord(err) && Array.isArray(err.InstructionError)) {
    const detail: unknown = err.InstructionError[1];
    // Kit's RPC returns the code as a bigint, though its types say number.
    const custom = isRecord(detail) ? detail.Custom : undefined;
    if (typeof custom === "number" || typeof custom === "bigint") {
      const code = Number(custom);
      const name = PROGRAM_ERROR_CODES[code];
      if (name) return new ProgramError(name, name);
      if (code === SYSTEM_INSUFFICIENT_LAMPORTS) {
        return new Error(NO_SOL_MESSAGE);
      }
    }
  }
  const detail = JSON.stringify(err, (_, value: unknown) =>
    typeof value === "bigint" ? Number(value) : value
  );
  return new Error(`The transaction failed (${detail}).`);
}
