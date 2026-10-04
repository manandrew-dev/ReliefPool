import { OracleApiError } from "../api/oracle";
import { ProgramError, type ProgramErrorCode } from "../program/client";

function hasOwn<T extends object>(object: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(object, key);
}

// Readable text for program errors (docs/api.md section 5.4). Used for
// contribute errors and for payout failures, where the oracle reports the
// program error name as failureReason.
const PROGRAM_ERROR_TEXT: Record<ProgramErrorCode, string> = {
  Unauthorized: "The signer is not allowed to do that.",
  TooManyResponders: "The pool already has the maximum of 5 responders.",
  InvalidShares: "Responder shares do not add up to 100%.",
  BelowThreshold: "The risk score is below the pool's threshold.",
  InsufficientFunds: "The pool's vault doesn't have enough SOL for a payout.",
  ZeroAmount: "Enter an amount greater than 0.",
  InvalidThreshold: "The pool's threshold must be from 0 to 100.",
  DuplicateResponder: "That wallet is already a responder in this pool.",
};

// Readable text for the oracle's failureReason codes (docs/api.md 3.1).
const FAILURE_REASON_TEXT: Record<string, string> = {
  CLASSIFIER_UNAVAILABLE:
    "The risk classifier didn't answer, so the event wasn't scored.",
  CLASSIFIER_REJECTED: "The risk classifier rejected the event data.",
  CLASSIFIER_INVALID_RESPONSE: "The risk classifier sent an invalid response.",
  SOLANA_UNAVAILABLE:
    "The oracle couldn't read the pool's threshold from Solana.",
  PAYOUT_ALREADY_EXISTS:
    "A payout for this event ID is already on-chain, so it wasn't paid again.",
  TRANSACTION_FAILED: "The payout transaction failed.",
  INTERNAL_ERROR: "The oracle hit an unexpected error.",
};

// failureReason is a bare code (api.md 3.1): one of the oracle's codes or
// a program error name. Unknown codes are shown as they are.
export function describeFailureReason(code: string): string {
  if (hasOwn(FAILURE_REASON_TEXT, code)) return FAILURE_REASON_TEXT[code];
  if (hasOwn(PROGRAM_ERROR_TEXT, code)) return PROGRAM_ERROR_TEXT[code];
  return `Unrecognized failure (${code}).`;
}

// The 409 from POST /replay for an event ID the oracle already has stored
// or is still processing (api.md 3.7). Nothing was scored. This is not
// PAYOUT_ALREADY_EXISTS, which arrives as the failureReason of a failed
// event on a normal 202 response.
export function isAlreadyProcessed(error: unknown): boolean {
  return (
    error instanceof OracleApiError && error.code === "EVENT_ALREADY_PROCESSED"
  );
}

// Errors from POST /replay, other than the 409 the demo panel shows as
// "double payout blocked" (api.md 3.7).
export function describeReplayError(error: unknown): string {
  if (error instanceof OracleApiError) {
    if (error.code === "INVALID_REQUEST") {
      return `The backend rejected this replay as invalid (${error.message}). Event IDs can be at most 32 bytes, and run IDs can use only letters, digits, - and _.`;
    }
    if (error.code === "SCENARIO_NOT_FOUND") {
      return "The backend no longer has this scenario. Reload the page to get the current list.";
    }
  }
  return describeError(error);
}

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
