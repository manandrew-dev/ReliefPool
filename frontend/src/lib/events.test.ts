import { describe, expect, it } from "vitest";
import type { QuakeEvent } from "../api/types";
import { describeEventOutcome, isNotScored } from "./events";

describe("isNotScored", () => {
  it.each([
    [0, 4.8, true],
    [0, 4.99, true],
    [0, 0, true],
    // M5.0 and above go to the classifier, which can really return 0.
    [0, 5.0, false],
    [0, 6.1, false],
    // A real score, or a failed event, is never "not scored".
    [12, 4.8, false],
    [null, 4.8, false],
  ])("riskScore %s at M%s -> %s", (riskScore, magnitude, expected) => {
    expect(isNotScored({ riskScore, magnitude })).toBe(expected);
  });
});

describe("describeEventOutcome", () => {
  const base: QuakeEvent = {
    id: "jp-2022-m73-r1",
    source: "replay",
    time: "2022-03-16T14:36:33Z",
    processedAt: "2026-10-04T10:00:00Z",
    magnitude: 7.3,
    depthKm: 41,
    latitude: 37.7132,
    longitude: 141.5793,
    place: "off the coast of Fukushima, Japan",
    riskScore: 95,
    threshold: 70,
    status: "scored",
    failureReason: null,
    payout: null,
  };

  it("explains PAYOUT_ALREADY_EXISTS as a failed event, not a 409", () => {
    // api.md 3.7: a normal 202 with status "failed", riskScore kept and
    // payout null, when the oracle has no record but the chain does.
    const event: QuakeEvent = {
      ...base,
      status: "failed",
      failureReason: "PAYOUT_ALREADY_EXISTS",
    };
    expect(describeEventOutcome(event)).toBe(
      "A payout for this event ID is already on-chain, so it wasn't paid again."
    );
  });

  it.each([
    [
      { status: "scored", riskScore: 59 },
      "Scored 59, below the threshold of 70. No payout.",
    ],
    [
      { status: "scored", riskScore: 0, magnitude: 4.8 },
      "Below M5.0, not scored. No payout.",
    ],
    [
      {
        status: "pending",
        payout: {
          signature: "s",
          amountLamports: 0,
          explorerUrl: "",
          confirmedAt: null,
        },
      },
      "Scored 95. Payout submitted, confirming…",
    ],
    [
      {
        status: "paid",
        payout: {
          signature: "s",
          amountLamports: 100000000,
          explorerUrl: "",
          confirmedAt: "2026-10-04T10:00:03Z",
        },
      },
      "Scored 95. Paid 0.1 SOL to responders.",
    ],
    [
      {
        status: "failed",
        riskScore: null,
        failureReason: "CLASSIFIER_UNAVAILABLE",
      },
      "The risk classifier didn't answer, so the event wasn't scored.",
    ],
  ] as [Partial<QuakeEvent>, string][])("%j -> %s", (change, text) => {
    expect(describeEventOutcome({ ...base, ...change })).toBe(text);
  });
});
