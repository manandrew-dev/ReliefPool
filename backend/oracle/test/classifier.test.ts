// HttpClassifier against a fake server that follows Keith's contract.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { ClassifierError, HttpClassifier } from "../src/classifier.js";
import { quake } from "./helpers.js";

type Handler = (body: Record<string, unknown>, res: ServerResponse) => void;

let handler: Handler;
let requests: Record<string, unknown>[] = [];
let classifier: HttpClassifier;
let close: () => void;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

// rules-v1 style answer that echoes the eventId.
const ok: Handler = (body, res) =>
  json(res, 200, { eventId: body.eventId, riskScore: 81, modelVersion: "rules-v1" });

before(async () => {
  const server = createServer((req: IncomingMessage, res) => {
    if (req.url === "/health") return json(res, 200, { status: "ok", modelVersion: "model-v1" });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      requests.push(body);
      handler(body, res);
    });
  });
  server.listen(0);
  await new Promise((r) => server.once("listening", r));
  classifier = new HttpClassifier(`http://localhost:${(server.address() as AddressInfo).port}`);
  close = () => server.close();
});

after(() => close());

beforeEach(() => {
  requests = [];
  handler = ok;
});

const rejectsWith = (reason: string) => (err: unknown) =>
  err instanceof ClassifierError && err.reason === reason;

test("sends exactly the five contract fields", async () => {
  const result = await classifier.score("us6000h519", quake({ magnitude: 7.3, depthKm: 41 }));
  assert.deepEqual(result, { riskScore: 81, modelVersion: "rules-v1" });
  assert.deepEqual(requests, [
    { eventId: "us6000h519", magnitude: 7.3, depthKm: 41, latitude: 38, longitude: 142 },
  ]);
});

test("reads modelVersion from /health", async () => {
  assert.deepEqual(await classifier.health(), { status: "ok", modelVersion: "model-v1" });
});

test("a 4xx is a rejection and is not retried", async () => {
  handler = (_b, res) => json(res, 422, { detail: "latitude out of range" });
  await assert.rejects(classifier.score("e1", quake()), rejectsWith("CLASSIFIER_REJECTED"));
  assert.equal(requests.length, 1);
});

test("a 5xx is retried once, then reported unavailable", async () => {
  handler = (_b, res) => json(res, 503, { detail: "model not loaded" });
  await assert.rejects(classifier.score("e1", quake()), rejectsWith("CLASSIFIER_UNAVAILABLE"));
  assert.equal(requests.length, 2);
});

test("a 5xx followed by success returns the score", async () => {
  let calls = 0;
  handler = (body, res) => (++calls === 1 ? json(res, 500, {}) : ok(body, res));
  assert.equal((await classifier.score("e1", quake())).riskScore, 81);
});

test("responses outside the contract are rejected", async () => {
  const cases: Record<string, unknown>[] = [
    { eventId: "other", riskScore: 81, modelVersion: "rules-v1" },
    { eventId: "e1", riskScore: 81.5, modelVersion: "rules-v1" },
    { eventId: "e1", riskScore: 101, modelVersion: "rules-v1" },
    { eventId: "e1", riskScore: 81 },
  ];
  for (const body of cases) {
    handler = (_b, res) => json(res, 200, body);
    await assert.rejects(
      classifier.score("e1", quake()),
      rejectsWith("CLASSIFIER_INVALID_RESPONSE"),
      JSON.stringify(body),
    );
  }
});

test("an unreachable classifier is unavailable, and health reports down", async () => {
  const dead = new HttpClassifier("http://localhost:1");
  await assert.rejects(dead.score("e1", quake()), rejectsWith("CLASSIFIER_UNAVAILABLE"));
  assert.deepEqual(await dead.health(), { status: "down", modelVersion: null });
});
