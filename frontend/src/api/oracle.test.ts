import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadOracle() {
  vi.resetModules();
  return import("./oracle");
}

describe("mock POST /replay validation (api.md 3.7)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ORACLE_MOCK", "true");
  });

  it.each(["has space", "dot.dot", "semi;colon", "é"])(
    "rejects run ID %j with 400 INVALID_REQUEST",
    async (runId) => {
      const oracle = await loadOracle();
      await expect(
        oracle.postReplay({ scenarioId: "jp-2022-m73", runId })
      ).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
    }
  );

  it("rejects an event ID over 32 bytes with 400 before scoring", async () => {
    const oracle = await loadOracle();
    await expect(
      oracle.postReplay({
        scenarioId: "jp-2013-m69-deep",
        runId: "x".repeat(16),
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
    const { events } = await oracle.getEvents();
    expect(events.some((e) => e.id.startsWith("jp-2013-m69-deep-"))).toBe(
      false
    );
  });

  it("accepts a valid run ID", async () => {
    const oracle = await loadOracle();
    const event = await oracle.postReplay({
      scenarioId: "jp-2013-m69-deep",
      runId: "rehearsal_2-b",
    });
    expect(event.id).toBe("jp-2013-m69-deep-rehearsal_2-b");
  });
});
