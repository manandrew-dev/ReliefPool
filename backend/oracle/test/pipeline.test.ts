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

// A classifier whose answer the test releases by hand.
function gatedClassifier() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const classifier: Classifier = {
    score: async () => {
      await gate;
      return { riskScore: 10, modelVersion: "rules-v1" };
    },
    health: async () => ({ status: "ok", modelVersion: "rules-v1" }),
  };
  return { classifier, release };
}

const isApiError = (status: number) => (err: unknown) =>
  err instanceof ApiError && err.status === status;

test("below-threshold replay returns scored, not paid", async () => {
  const { pipeline } = setup();
  const e = await pipeline.replay(scenario("jp-2013-m69-deep"));
  assert.equal(e.status, "scored");
  assert.equal(e.riskScore, 27);
  assert.equal(e.threshold, 70);
  assert.equal(e.payout, null);
});

test("above-threshold replay returns pending, then becomes paid", async () => {
  const { store, pipeline } = setup();
  const e = await pipeline.replay(scenario("jp-2022-m73"));
  assert.equal(e.source, "replay");
  assert.equal(e.status, "pending");
  assert.equal(e.riskScore, 77);
  assert.ok(e.payout?.signature);
  assert.equal(e.payout?.confirmedAt, null);

  const paid = await settled(store, "jp-2022-m73");
  assert.equal(paid.status, "paid");
  assert.equal(paid.payout?.amountLamports, 100_000_000);
  assert.match(paid.payout!.explorerUrl, /cluster=devnet$/);
  assert.ok(paid.payout?.confirmedAt);
});

test("quake below MIN_MAGNITUDE gets score 0 without calling the classifier", async () => {
  const { pipeline } = setup({ classifier: failingClassifier });
  const e = await pipeline.replay(scenario("jp-2025-m48"));
  assert.equal(e.status, "scored");
  assert.equal(e.riskScore, 0);
});

test("replaying the same scenario twice is rejected with 409", async () => {
  const { pipeline } = setup();
  await pipeline.replay(scenario("jp-2022-m73"));
  await assert.rejects(pipeline.replay(scenario("jp-2022-m73")), isApiError(409));
});

test("a replay still being scored also blocks a second one", async () => {
  const { classifier, release } = gatedClassifier();
  const { pipeline } = setup({ classifier });
  const first = pipeline.replay(scenario("jp-2013-m69-deep"));
  await assert.rejects(pipeline.replay(scenario("jp-2013-m69-deep")), isApiError(409));
  release();
  assert.equal((await first).status, "scored");
});

test("runId gives a fresh event ID", async () => {
  const { pipeline } = setup();
  await pipeline.replay(scenario("jp-2022-m73"));
  const e = await pipeline.replay(scenario("jp-2022-m73"), "r2");
  assert.equal(e.id, "jp-2022-m73-r2");
  assert.equal(e.status, "pending");
});

test("event ID over 32 bytes is rejected", async () => {
  const { pipeline } = setup();
  await assert.rejects(
    pipeline.replay(scenario("tohoku-2011-m91"), "a-very-long-run-id"),
    isApiError(400),
  );
});

test("classifier failure: failed, riskScore null, never paid (NFR-7)", async () => {
  const { chain, pipeline } = setup({ classifier: failingClassifier });
  const e = await pipeline.replay(scenario("jp-2022-m73"));
  assert.equal(e.status, "failed");
  assert.equal(e.failureReason, "CLASSIFIER_UNAVAILABLE");
  assert.equal(e.riskScore, null);
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
  const { pipeline } = setup({ classifier: rejecting });
  const e = await pipeline.replay(scenario("jp-2022-m73"));
  assert.equal(e.status, "failed");
  assert.equal(e.failureReason, "CLASSIFIER_REJECTED");
  assert.equal(e.riskScore, null);
});

test("a live event is not stored until it is scored", async () => {
  const { classifier, release } = gatedClassifier();
  const { store, pipeline } = setup({ classifier });
  const done = pipeline.processLive(quake({ usgsId: "us-slow" }));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(store.has("us-slow"), false);
  // The next poll sees the same event while it is still being scored and skips it.
  await pipeline.processLive(quake({ usgsId: "us-slow" }));
  release();
  await done;
  assert.equal(store.get("us-slow")?.riskScore, 10);
  assert.equal(store.all().length, 1);
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
  assert.equal(e.status, "paid");
  assert.equal(store.all().length, 1);
});

test("an event already paid on-chain is not paid again", async () => {
  const { store, chain, pipeline } = setup();
  await chain.triggerPayout("us-dup", 99);
  await pipeline.processLive(quake({ usgsId: "us-dup" }));
  const e = store.get("us-dup")!;
  assert.equal(e.status, "failed");
  assert.equal(e.failureReason, "PAYOUT_ALREADY_EXISTS");
  assert.equal(e.riskScore, 98);
});

test("stored events have a riskScore unless failed", async () => {
  const { store, pipeline } = setup();
  for (const id of ["jp-2025-m48", "jp-2013-m69-deep", "jp-2022-m73", "tohoku-2011-m91"]) {
    await pipeline.replay(scenario(id));
  }
  for (const e of store.all()) {
    if (e.status !== "failed") assert.notEqual(e.riskScore, null, e.id);
  }
});
