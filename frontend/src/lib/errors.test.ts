import { describe, expect, it } from "vitest";
import { describeFailureReason } from "./errors";

describe("describeFailureReason", () => {
  // Every code in the docs/api.md section 3.1 table.
  it.each([
    [
      "CLASSIFIER_UNAVAILABLE",
      "The risk classifier didn't answer, so the event wasn't scored.",
    ],
    ["CLASSIFIER_REJECTED", "The risk classifier rejected the event data."],
    [
      "CLASSIFIER_INVALID_RESPONSE",
      "The risk classifier sent an invalid response.",
    ],
    [
      "SOLANA_UNAVAILABLE",
      "The oracle couldn't read the pool's threshold from Solana.",
    ],
    ["PAYOUT_ALREADY_EXISTS", "A payout for this event is already on-chain."],
    ["TRANSACTION_FAILED", "The payout transaction failed."],
    ["INTERNAL_ERROR", "The oracle hit an unexpected error."],
  ])("maps oracle code %s", (code, text) => {
    expect(describeFailureReason(code)).toBe(text);
  });

  // Program error names from section 5.4, reported as failureReason.
  it.each([
    [
      "InsufficientFunds",
      "The pool's vault doesn't have enough SOL for a payout.",
    ],
    ["BelowThreshold", "The risk score is below the pool's threshold."],
    ["InvalidShares", "Responder shares do not add up to 100%."],
    ["Unauthorized", "The signer is not allowed to do that."],
    ["TooManyResponders", "The pool already has the maximum of 5 responders."],
    ["ZeroAmount", "Enter an amount greater than 0."],
  ])("maps program error %s", (code, text) => {
    expect(describeFailureReason(code)).toBe(text);
  });

  it.each([
    "SOMETHING_NEW",
    "insufficientfunds",
    "",
    "constructor",
    "toString",
  ])("shows unknown code %j as it is", (code) => {
    expect(describeFailureReason(code)).toBe(`Unrecognized failure (${code}).`);
  });
});
