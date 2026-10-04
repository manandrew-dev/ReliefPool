import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EventStore } from "../src/store.js";
import type { QuakeEvent } from "../src/types.js";
import { toQuakeInput } from "../src/usgs.js";

function event(id: string, processedAt: string, status: QuakeEvent["status"] = "scored"): QuakeEvent {
  return {
    id,
    source: "live",
    time: processedAt,
    processedAt,
    magnitude: 6,
    depthKm: 10,
    latitude: 38,
    longitude: 142,
    place: "test",
    riskScore: 10,
    threshold: 70,
    status,
    failureReason: null,
    payout: null,
  };
}

test("query sorts newest first and applies filters", () => {
  const store = new EventStore(null);
  store.insert(event("a", "2026-10-03T10:00:00Z"));
  store.insert(event("b", "2026-10-03T12:00:00Z", "paid"));
  store.insert(event("c", "2026-10-03T11:00:00Z"));
  assert.deepEqual(store.query({ limit: 20 }).map((e) => e.id), ["b", "c", "a"]);
  assert.deepEqual(store.query({ limit: 1 }).map((e) => e.id), ["b"]);
  assert.deepEqual(store.query({ limit: 20, status: "paid" }).map((e) => e.id), ["b"]);
  assert.deepEqual(
    store.query({ limit: 20, since: "2026-10-03T10:30:00Z" }).map((e) => e.id),
    ["b", "c"],
  );
});

test("events survive a restart", () => {
  const file = join(mkdtempSync(join(tmpdir(), "oracle-")), "events.json");
  const first = new EventStore(file);
  first.insert(event("a", "2026-10-03T10:00:00Z"));
  first.update("a", { status: "paid" });
  const second = new EventStore(file);
  assert.equal(second.get("a")?.status, "paid");
});

test("toQuakeInput maps a USGS feature", () => {
  const input = toQuakeInput({
    id: "us6000h519",
    properties: { mag: 7.3, place: "57 km ENE of Namie, Japan", time: 1647441390997 },
    geometry: { coordinates: [141.5793, 37.7132, 41] },
  });
  assert.deepEqual(input, {
    usgsId: "us6000h519",
    time: "2022-03-16T14:36:30Z",
    magnitude: 7.3,
    depthKm: 41,
    latitude: 37.7132,
    longitude: 141.5793,
    place: "57 km ENE of Namie, Japan",
  });
  // A missing required field is never filled in.
  assert.equal(
    toQuakeInput({ id: "x", properties: { mag: null, place: null, time: 0 }, geometry: { coordinates: [0, 0, 0] } }),
    null,
  );
  assert.equal(
    toQuakeInput({
      id: "y",
      properties: { mag: 6, place: null, time: 0 },
      geometry: { coordinates: [142, 38, null as unknown as number] },
    }),
    null,
  );
});
