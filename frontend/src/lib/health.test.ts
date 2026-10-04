import { describe, expect, it } from "vitest";
import type { HealthResponse } from "../api/types";
import { describeHealth } from "./health";

const healthy: HealthResponse = {
  status: "ok",
  classifier: "ok",
  classifierModelVersion: "model-v1",
  solana: "ok",
  lastFeedPollAt: "2026-10-03T18:42:00Z",
};

describe("describeHealth", () => {
  it("reports a healthy backend as online with the model version", () => {
    const summary = describeHealth(healthy);
    expect(summary).toMatchObject({ tone: "ok", label: "Backend online" });
    expect(summary.detail).toContain("Classifier: ok (model-v1).");
    expect(summary.detail).toContain("Solana: ok.");
    expect(summary.detail).toContain("Last feed poll:");
  });

  it.each([
    [{ solana: "mock" }, "Backend: mock chain, payouts aren't real"],
    [{ classifier: "mock" }, "Backend: mock classifier, scores aren't real"],
    [
      { classifier: "mock", solana: "mock" },
      "Backend: mock classifier and chain, payouts aren't real",
    ],
    [
      { classifier: "down", classifierModelVersion: null },
      "Backend: classifier down",
    ],
    [{ solana: "down" }, "Backend: Solana down"],
    [
      { classifier: "down", classifierModelVersion: null, solana: "mock" },
      "Backend: classifier down, mock chain, payouts aren't real",
    ],
  ] as [Partial<HealthResponse>, string][])("%j -> %s", (change, label) => {
    const summary = describeHealth({ ...healthy, ...change });
    expect(summary).toMatchObject({ tone: "warning", label });
  });

  it("handles a missing model version and no feed poll yet", () => {
    const summary = describeHealth({
      ...healthy,
      classifier: "down",
      classifierModelVersion: null,
      lastFeedPollAt: null,
    });
    expect(summary.detail).toContain("Classifier: down.");
    expect(summary.detail).toContain("No feed poll yet.");
  });

  it("shows the rules-based scorer version", () => {
    const summary = describeHealth({
      ...healthy,
      classifier: "mock",
      classifierModelVersion: "rules-v1",
    });
    expect(summary.detail).toContain("Classifier: mock (rules-v1).");
  });
});

describe("describeHealth never trusts the top-level status alone", () => {
  const values = ["ok", "down", "mock", "degraded", undefined] as const;

  it.each(
    values.flatMap((classifier) =>
      values.map((solana) => [classifier, solana] as const)
    )
  )("classifier %s, solana %s", (classifier, solana) => {
    const summary = describeHealth({
      ...healthy,
      status: "ok",
      classifier: classifier as HealthResponse["classifier"],
      solana: solana as HealthResponse["solana"],
    });
    const allOk = classifier === "ok" && solana === "ok";
    expect(summary.tone).toBe(allOk ? "ok" : "warning");
    expect(summary.label === "Backend online").toBe(allOk);
    if (classifier === "down")
      expect(summary.label).toContain("classifier down");
    if (solana === "down") expect(summary.label).toContain("Solana down");
    if (classifier === "mock") expect(summary.label).toMatch(/mock classifier/);
    if (solana === "mock")
      expect(summary.label).toMatch(/mock (classifier and )?chain/);
    if (classifier === "degraded" || classifier === undefined) {
      expect(summary.label).toContain("classifier status unknown");
    }
    if (solana === "degraded" || solana === undefined) {
      expect(summary.label).toContain("Solana status unknown");
    }
  });
});
