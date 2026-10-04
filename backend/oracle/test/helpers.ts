import { MockChain } from "../src/chain.js";
import { MockClassifier, type Classifier } from "../src/classifier.js";
import { Pipeline } from "../src/pipeline.js";
import { loadScenarios } from "../src/scenarios.js";
import { EventStore } from "../src/store.js";
import type { QuakeEvent, QuakeInput } from "../src/types.js";

export const JAPAN = { minLat: 30, maxLat: 46, minLon: 135, maxLon: 150 };

export const scenarios = loadScenarios();
export const scenario = (id: string) => scenarios.find((s) => s.id === id)!;

export function quake(overrides: Partial<QuakeInput> = {}): QuakeInput {
  return {
    usgsId: "us0000test",
    time: "2026-10-03T18:00:00Z",
    magnitude: 7.5,
    depthKm: 20,
    latitude: 38,
    longitude: 142,
    place: "off the coast of Japan",
    ...overrides,
  };
}

export function setup(opts: { classifier?: Classifier; threshold?: number } = {}) {
  const store = new EventStore(null);
  const chain = new MockChain({
    threshold: opts.threshold ?? 70,
    payoutLamports: 100_000_000,
    confirmMs: 0,
  });
  const classifier = opts.classifier ?? new MockClassifier();
  const pipeline = new Pipeline({
    store,
    chain,
    classifier,
    bounds: JAPAN,
    minMagnitude: 5,
    defaultThreshold: 70,
    log: () => {},
  });
  return { store, chain, classifier, pipeline };
}

// Waits for a pending payout to confirm or fail.
export async function settled(store: EventStore, id: string): Promise<QuakeEvent> {
  for (let i = 0; i < 100; i++) {
    const e = store.get(id);
    if (e && e.status !== "pending") return e;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Event ${id} did not settle`);
}
