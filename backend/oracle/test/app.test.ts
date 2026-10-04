import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { scenarios, setup } from "./helpers.js";

let base: string;
let close: () => void;

before(async () => {
  const { store, chain, classifier, pipeline } = setup();
  const app = createApp({
    config: {
      corsOrigins: ["http://localhost:5173"],
      programId: null,
      poolAddress: null,
      vaultAddress: null,
      region: { id: 1, name: "Japan Pacific Coast", bounds: { minLat: 30, maxLat: 46, minLon: 135, maxLon: 150 } },
      labels: {},
    },
    store,
    pipeline,
    classifier,
    chain,
    scenarios,
    lastFeedPollAt: () => null,
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
  close = () => server.close();
});

after(() => close());

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("GET /health", async () => {
  const res = await fetch(`${base}/health`);
  assert.deepEqual(await res.json(), {
    status: "ok",
    classifier: "mock",
    classifierModelVersion: "mock",
    solana: "mock",
    lastFeedPollAt: null,
  });
});

test("CORS allows the frontend origin only", async () => {
  const allowed = await fetch(`${base}/health`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const other = await fetch(`${base}/health`, { headers: { Origin: "http://evil.example" } });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("GET /replay/scenarios lists both outcomes", async () => {
  const { scenarios: list } = await (await fetch(`${base}/replay/scenarios`)).json();
  const outcomes = new Set(list.map((s: { expectedOutcome: string }) => s.expectedOutcome));
  assert.deepEqual(outcomes, new Set(["payout", "no_payout"]));
});

test("POST /replay -> 202, then 409 on repeat, 404 on unknown, 400 on bad body", async () => {
  const first = await post("/replay", { scenarioId: "jp-2022-m73" });
  assert.equal(first.status, 202);
  const created = await first.json();
  assert.equal(created.id, "jp-2022-m73");
  // Scored before the response (docs/api.md §3.7).
  assert.equal(created.status, "pending");
  assert.equal(created.riskScore, 77);

  const below = await post("/replay", { scenarioId: "jp-2013-m69-deep" });
  assert.equal(below.status, 202);
  assert.deepEqual(
    (({ status, riskScore }) => ({ status, riskScore }))(await below.json()),
    { status: "scored", riskScore: 27 },
  );

  const repeat = await post("/replay", { scenarioId: "jp-2022-m73" });
  assert.equal(repeat.status, 409);
  assert.equal((await repeat.json()).error.code, "EVENT_ALREADY_PROCESSED");

  const unknown = await post("/replay", { scenarioId: "nope" });
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, "SCENARIO_NOT_FOUND");

  const bad = await post("/replay", {});
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, "INVALID_REQUEST");
});

test("GET /events validates query params", async () => {
  for (const q of ["limit=0", "limit=101", "status=done", "since=yesterday"]) {
    const res = await fetch(`${base}/events?${q}`);
    assert.equal(res.status, 400, q);
  }
  assert.equal((await fetch(`${base}/events?limit=5&status=paid`)).status, 200);
});

test("GET /events/:id returns 404 for an unknown ID", async () => {
  const res = await fetch(`${base}/events/missing`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, "EVENT_NOT_FOUND");
});
