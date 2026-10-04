import { describe, expect, it } from "vitest";
import { scenariosFixture } from "../api/fixtures";
import {
  MAX_EVENT_ID_BYTES,
  eventIdBytes,
  newRunId,
  replayEventId,
} from "./replay";

describe("replay event IDs", () => {
  const longest = scenariosFixture
    .map((s) => s.id)
    .reduce((a, b) => (eventIdBytes(b) > eventIdBytes(a) ? b : a));

  it("finds jp-2013-m69-deep as the longest demo scenario ID", () => {
    expect(longest).toBe("jp-2013-m69-deep");
    expect(eventIdBytes(longest)).toBe(16);
  });

  it.each([
    ["the current time", Date.now()],
    ["the Unix epoch", 0],
    ["the year 2100", Date.UTC(2100, 0, 1)],
    ["the largest safe timestamp", Number.MAX_SAFE_INTEGER],
  ])(
    "keeps the longest scenario plus an auto run ID within 32 bytes at %s",
    (_, now) => {
      const id = replayEventId(longest, newRunId(now));
      expect(eventIdBytes(id)).toBeLessThanOrEqual(MAX_EVENT_ID_BYTES);
    }
  );

  it("never makes a run ID longer than 7 characters", () => {
    for (let now = 0; now < 2 ** 52; now = now * 3 + 1) {
      expect(newRunId(now).length).toBeLessThanOrEqual(7);
    }
  });

  it("uses the scenario ID alone without a run ID", () => {
    expect(replayEventId("tohoku-2011-m91")).toBe("tohoku-2011-m91");
    expect(replayEventId("tohoku-2011-m91", "r1")).toBe("tohoku-2011-m91-r1");
  });

  it("counts bytes, not characters", () => {
    expect(eventIdBytes("é")).toBe(2);
  });
});
