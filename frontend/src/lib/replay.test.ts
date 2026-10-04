import { describe, expect, it } from "vitest";
import { scenariosFixture } from "../api/fixtures";
import {
  MAX_EVENT_ID_BYTES,
  RUN_ID_PATTERN,
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

  it("only uses letters, digits, - and _ in run IDs", () => {
    const samples = [0, 1, 35, 36, Date.now(), Number.MAX_SAFE_INTEGER];
    for (let now = 0; now < 2 ** 52; now = now * 7 + 3) samples.push(now);
    for (const now of samples) {
      expect(newRunId(now)).toMatch(RUN_ID_PATTERN);
    }
  });

  it.each(["r1a2b3", "rehearsal-2", "run_3", "ABC"])(
    "accepts %j as a run ID",
    (runId) => expect(runId).toMatch(RUN_ID_PATTERN)
  );

  it.each(["", "has space", "dot.dot", "slash/", "é", "semi;colon"])(
    "rejects %j as a run ID",
    (runId) => expect(runId).not.toMatch(RUN_ID_PATTERN)
  );

  it("uses the scenario ID alone without a run ID", () => {
    expect(replayEventId("tohoku-2011-m91")).toBe("tohoku-2011-m91");
    expect(replayEventId("tohoku-2011-m91", "r1")).toBe("tohoku-2011-m91-r1");
  });

  it("counts bytes, not characters", () => {
    expect(eventIdBytes("é")).toBe(2);
  });
});
