import type { QuakeEvent } from "../api/types";
import { describeFailureReason } from "./errors";
import { formatLamportsAsSol } from "./format";
import { confirmedPayout } from "./payouts";

// The oracle sends only quakes of M5.0 and above to the classifier. Smaller
// in-region quakes get riskScore 0 without being scored (api.md 3.1).
export const CLASSIFIER_MIN_MAGNITUDE = 5.0;

export function isNotScored(
  event: Pick<QuakeEvent, "riskScore" | "magnitude">
): boolean {
  return event.riskScore === 0 && event.magnitude < CLASSIFIER_MIN_MAGNITUDE;
}

// One line on what happened to an event, for the demo panel. A failed
// event explains itself through failureReason, which covers
// PAYOUT_ALREADY_EXISTS too: that is a failed event on a normal 202, not
// the 409 for a repeated replay (api.md 3.7).
export function describeEventOutcome(event: QuakeEvent): string {
  const score = event.riskScore;
  switch (event.status) {
    case "scored":
      if (isNotScored(event)) return "Below M5.0, not scored. No payout.";
      return `Scored ${score}, below the threshold of ${event.threshold}. No payout.`;
    case "pending":
      return `Scored ${score}. Payout submitted, confirming…`;
    case "paid": {
      const payout = confirmedPayout(event);
      return payout
        ? `Scored ${score}. Paid ${formatLamportsAsSol(payout.amountLamports)} SOL to responders.`
        : `Scored ${score}. Paid.`;
    }
    case "failed":
      return event.failureReason
        ? describeFailureReason(event.failureReason)
        : "Processing failed.";
  }
}
