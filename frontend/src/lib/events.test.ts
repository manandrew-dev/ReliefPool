import { describe, expect, it } from "vitest";
import { isNotScored } from "./events";

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
