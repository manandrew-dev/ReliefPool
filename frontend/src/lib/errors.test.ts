import { describe, expect, it } from "vitest";
import { OracleApiError } from "../api/oracle";
import {
  describeFailureReason,
  describeReplayError,
  isAlreadyProcessed,
} from "./errors";

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
    [
      "PAYOUT_ALREADY_EXISTS",
      "A payout for this event ID is already on-chain, so it wasn't paid again.",
    ],
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

describe("describeReplayError", () => {
  it("explains a 400 INVALID_REQUEST with the ID rules", () => {
    const text = describeReplayError(
      new OracleApiError(400, "INVALID_REQUEST", "Event ID exceeds 32 bytes.")
    );
    expect(text).toBe(
      "The backend rejected this replay as invalid (Event ID exceeds 32 bytes.). Event IDs can be at most 32 bytes, and run IDs can use only letters, digits, - and _."
    );
  });

  it("explains a missing scenario", () => {
    expect(
      describeReplayError(
        new OracleApiError(404, "SCENARIO_NOT_FOUND", "No replay scenario.")
      )
    ).toBe(
      "The backend no longer has this scenario. Reload the page to get the current list."
    );
  });

  it("falls back to the general text for other errors", () => {
    expect(
      describeReplayError(
        new OracleApiError(0, "NETWORK_ERROR", "fetch failed")
      )
    ).toBe("Can't reach the backend.");
  });
});

describe("isAlreadyProcessed", () => {
  it("is true only for the 409 EVENT_ALREADY_PROCESSED from POST /replay", () => {
    expect(
      isAlreadyProcessed(
        new OracleApiError(409, "EVENT_ALREADY_PROCESSED", "Already processed.")
      )
    ).toBe(true);
  });

  it.each([
    new OracleApiError(400, "INVALID_REQUEST", "Bad runId."),
    new OracleApiError(404, "SCENARIO_NOT_FOUND", "No scenario."),
    new OracleApiError(0, "NETWORK_ERROR", "fetch failed"),
    new Error("PAYOUT_ALREADY_EXISTS"),
    "PAYOUT_ALREADY_EXISTS",
  ])("is false for %s", (error) => {
    expect(isAlreadyProcessed(error)).toBe(false);
  });
});
