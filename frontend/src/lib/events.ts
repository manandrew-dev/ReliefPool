import type { QuakeEvent } from "../api/types";

// The oracle sends only quakes of M5.0 and above to the classifier. Smaller
// in-region quakes get riskScore 0 without being scored (api.md 3.1).
export const CLASSIFIER_MIN_MAGNITUDE = 5.0;

export function isNotScored(
  event: Pick<QuakeEvent, "riskScore" | "magnitude">
): boolean {
  return event.riskScore === 0 && event.magnitude < CLASSIFIER_MIN_MAGNITUDE;
}
