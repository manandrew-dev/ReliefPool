import type { Payout, QuakeEvent } from "../api/types";

// A payout counts as made only when the event is "paid" and the payout has
// confirmed. A "failed" event can still carry payout (api.md 3.1: sent,
// then failed on-chain, with amountLamports 0 and confirmedAt null), and a
// "pending" one carries amountLamports 0, so neither has an amount or a
// paid transaction to link to.
export function confirmedPayout(event: QuakeEvent): Payout | null {
  if (event.status !== "paid" || !event.payout) return null;
  if (event.payout.confirmedAt === null) return null;
  return event.payout;
}

export function paidEvents(
  events: readonly QuakeEvent[]
): (QuakeEvent & { payout: Payout })[] {
  return events.filter(
    (e): e is QuakeEvent & { payout: Payout } => confirmedPayout(e) !== null
  );
}

// A failed event whose payout transaction landed on-chain and then failed.
// One rejected at preflight simulation has payout null instead.
export function failedAfterSending(event: QuakeEvent): boolean {
  return event.status === "failed" && event.payout !== null;
}
