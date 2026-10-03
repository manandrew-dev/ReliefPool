import assert from "node:assert/strict";
import { test } from "node:test";
import { ClassifierError, type Classifier } from "../src/classifier.js";
import { ApiError } from "../src/errors.js";
import { quake, scenario, settled, setup } from "./helpers.js";

const failingClassifier: Classifier = {
  score: async () => {
    throw new ClassifierError("CLASSIFIER_UNAVAILABLE", "connection refused");
  },
  health: async () => ({ status: "down", modelVersion: null }),
};

test("below-threshold replay is scored and not paid", async () => {
  const { store, pipeline } = setup();
  pipeline.startReplay(scenario("jp-2013-m69-deep"));
  const e = await settled(store, "jp-2013-m69-deep");
  assert.equal(e.status, "scored");
  assert.equal(e.riskScore, 27);
  assert.equal(e.threshold, 70);
  assert.equal(e.payout, null);
});

test("above-threshold replay is paid", async () => {
  const { store, pipeline } = setup();
  const created = pipeline.startReplay(scenario("jp-2022-m73"));
  assert.equal(created.riskScore, null);
  assert.equal(created.source, "replay");
  const e = await settled(store, "jp-2022-m73");
  assert.equal(e.status, "paid");
  assert.equal(e.riskScore, 77);
  assert.ok(e.payout?.signature);
  assert.equal(e.payout?.amountLamports, 1_000_000_000);
  assert.match(e.payout!.explorerUrl, /cluster=devnet$/);
  assert.ok(e.payout?.confirmedAt);
});

test("quake below MIN_MAGNITUDE gets score 0 without calling the classifier", async () => {
  const { store, pipeline } = setup({ classifier: failingClassifier });
  pipeline.startReplay(scenario("jp-2025-m48"));
  const e = await settled(store, "jp-2025-m48");
  assert.equal(e.status, "scored");
  assert.equal(e.riskScore, 0);
});

test("replaying the same scenario twice is rejected with 409", async () => {
  const { store, pipeline } = setup();
  pipeline.startReplay(scenario("jp-2022-m73"));
  await settled(store, "jp-2022-m73");
  assert.throws(
    () => pipeline.startReplay(scenario("jp-2022-m73")),
    (err: unknown) => err instanceof ApiError && err.status === 409,
  );
});

test("runId gives a fresh event ID", async () => {
  const { store, pipeline } = setup();
  pipeline.startReplay(scenario("jp-2022-m73"));
  const e = pipeline.startReplay(scenario("jp-2022-m73"), "r2");
  assert.equal(e.id, "jp-2022-m73-r2");
  assert.equal((await settled(store, e.id)).status, "paid");
});

test("event ID over 32 bytes is rejected", () => {
  const { pipeline } = setup();
  assert.throws(
    () => pipeline.startReplay(scenario("tohoku-2011-m91"), "a-very-long-run-id"),
    (err: unknown) => err instanceof ApiError && err.status === 400,
  );
});

test("classifier failure marks the event failed and never pays (NFR-7)", async () => {
  const { store, chain, pipeline } = setup({ classifier: failingClassifier });
  pipeline.startReplay(scenario("jp-2022-m73"));
  const e = await settled(store, "jp-2022-m73");
  assert.equal(e.status, "failed");
  assert.equal(e.failureReason, "CLASSIFIER_UNAVAILABLE");
  assert.equal(e.payout, null);
  assert.equal(await chain.payoutExists("jp-2022-m73"), false);
});

test("classifier rejecting the input marks the event failed, not low risk", async () => {
  const rejecting: Classifier = {
    score: async () => {
      throw new ClassifierError("CLASSIFIER_REJECTED", "HTTP 422");
    },
    health: async () => ({ status: "ok", modelVersion: "rules-v1" }),
  };
  const { store, pipeline } = setup({ classifier: rejecting });
  pipeline.startReplay(scenario("jp-2022-m73"));
  const e = await settled(store, "jp-2022-m73");
  assert.equal(e.status, "failed");
  assert.equal(e.failureReason, "CLASSIFIER_REJECTED");
  assert.equal(e.riskScore, null);
});

test("live events: out-of-region dropped, duplicates ignored", async () => {
  const { store, pipeline } = setup();
  await pipeline.processLive(quake({ usgsId: "us-far", latitude: 0, longitude: 0 }));
  assert.equal(store.has("us-far"), false);

  await pipeline.processLive(quake({ usgsId: "us-near" }));
  await pipeline.processLive(quake({ usgsId: "us-near", magnitude: 9 }));
  const e = store.get("us-near")!;
  assert.equal(e.source, "live");
  assert.equal(e.magnitude, 7.5);
  assert.equal(store.all().length, 1);
});

test("an event already paid on-chain is not paid again", async () => {
  const { store, chain, pipeline } = setup();
  await chain.triggerPayout("us-dup", 99);
  await pipeline.processLive(quake({ usgsId: "us-dup" }));
  const e = store.get("us-dup")!;
  assert.equal(e.status, "failed");
  assert.equal(e.failureReason, "PAYOUT_ALREADY_EXISTS");
});
