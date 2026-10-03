import { OracleApiError } from "../api/oracle";
import { ProgramError, type ProgramErrorCode } from "../program/client";

// Readable text for program errors (docs/api.md section 5.4).
const PROGRAM_ERROR_TEXT: Record<ProgramErrorCode, string> = {
  Unauthorized: "This wallet is not allowed to do that.",
  TooManyResponders: "The pool already has the maximum of 5 responders.",
  InvalidShares: "Responder shares do not add up to 100%.",
  BelowThreshold: "The risk score is below the pool's threshold.",
  InsufficientFunds: "The pool does not have enough funds for this payout.",
  ZeroAmount: "Enter an amount greater than 0.",
};

export function describeError(error: unknown): string {
  if (error instanceof OracleApiError) {
    return error.code === "NETWORK_ERROR"
      ? "Can't reach the backend."
      : error.message;
  }
  if (error instanceof ProgramError) return PROGRAM_ERROR_TEXT[error.code];
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
