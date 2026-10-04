import { describe, expect, it } from "vitest";
import { eventsFixture } from "../api/fixtures";
import type { QuakeEvent } from "../api/types";
import { confirmedPayout, failedAfterSending, paidEvents } from "./payouts";

function fixture(id: string): QuakeEvent {
  const event = eventsFixture.find((e) => e.id === id);
  if (!event) throw new Error(`missing fixture ${id}`);
  return event;
}

describe("failed payouts (api.md 3.1)", () => {
  const rejected = fixture("us7000abd2"); // rejected at preflight
  const failedOnChain = fixture("us7000abd1"); // sent, then failed

  it("has fixtures for both kinds of payout failure", () => {
    expect(rejected).toMatchObject({
      status: "failed",
      failureReason: "Unauthorized",
      riskScore: 84,
      payout: null,
    });
    expect(failedOnChain).toMatchObject({
      status: "failed",
      failureReason: "TRANSACTION_FAILED",
      riskScore: 91,
      payout: { amountLamports: 0, confirmedAt: null },
    });
  });

  it("gives neither an amount or a paid transaction", () => {
    expect(confirmedPayout(rejected)).toBeNull();
    expect(confirmedPayout(failedOnChain)).toBeNull();
  });

  it("tells a sent-then-failed payout from one rejected at preflight", () => {
    expect(failedAfterSending(failedOnChain)).toBe(true);
    expect(failedAfterSending(rejected)).toBe(false);
  });

  it("leaves both out of payout history", () => {
    const ids = paidEvents([rejected, failedOnChain]).map((e) => e.id);
    expect(ids).toEqual([]);
  });
});

describe("confirmedPayout", () => {
  const paid = fixture("tohoku-2011-m91");

  it("returns the payout of a confirmed paid event", () => {
    expect(confirmedPayout(paid)).toMatchObject({
      amountLamports: 100000000,
      explorerUrl: expect.stringContaining("explorer.solana.com/tx/"),
    });
  });

  it("returns null while pending, when the amount is still 0", () => {
    const pending: QuakeEvent = {
      ...paid,
      status: "pending",
      payout: { ...paid.payout!, amountLamports: 0, confirmedAt: null },
    };
    expect(confirmedPayout(pending)).toBeNull();
  });

  it("returns null for a paid event without a confirmation time", () => {
    const unconfirmed: QuakeEvent = {
      ...paid,
      payout: { ...paid.payout!, confirmedAt: null },
    };
    expect(confirmedPayout(unconfirmed)).toBeNull();
  });

  it("keeps only confirmed payouts from the fixtures for payout history", () => {
    expect(paidEvents(eventsFixture).map((e) => e.id)).toEqual([
      "tohoku-2011-m91",
    ]);
  });
});
