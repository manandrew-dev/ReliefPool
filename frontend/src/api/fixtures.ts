// Fixture responses shaped exactly like the examples in docs/api.md section 3.
// Used by the oracle client while VITE_ORACLE_MOCK is on.

import { config } from "../config";
import { explorerTxUrl } from "../lib/format";
import { mockWallets } from "../mocks/wallets";
import type {
  HealthResponse,
  PoolResponse,
  QuakeEvent,
  ReplayScenario,
} from "./types";

// Matches the mock pool's threshold in src/mocks/chain.ts.
const THRESHOLD = 70;

const PAID_SIGNATURE =
  "5ae7Q5DpgZ1xWkrT3KRGNAckP4m1GgBJNE8JYLusq5bsrLugBREb3H5PvJPLeRLK";

export const healthFixture: HealthResponse = {
  status: "ok",
  classifier: "ok",
  classifierModelVersion: "model-v1",
  solana: "ok",
  lastFeedPollAt: "2026-10-03T18:42:00Z",
};

export const poolFixture: PoolResponse = {
  programId: config.programId,
  poolAddress: mockWallets.pool,
  vaultAddress: mockWallets.vault,
  cluster: "devnet",
  // The demo region (api.md 3.3).
  region: {
    id: 1,
    name: "Japan Pacific Coast",
    bounds: { minLat: 30, maxLat: 46, minLon: 135, maxLon: 150 },
  },
  // Display names from the demo pool setup (api.md 5.6).
  labels: {
    [mockWallets.responderA]: { name: "Coastal Relief NGO", role: "responder" },
    [mockWallets.responderB]: {
      name: "Harbor Rescue Network",
      role: "responder",
    },
    [mockWallets.contributorA]: {
      name: "Regional Government",
      role: "contributor",
    },
    [mockWallets.contributorB]: {
      name: "Pacific Aid Fund",
      role: "contributor",
    },
    [mockWallets.contributorC]: {
      name: "Community Donors",
      role: "contributor",
    },
  },
};

// Newest first, as GET /events returns them.
export const eventsFixture: QuakeEvent[] = [
  {
    // Below M5.0: never sent to the classifier, so riskScore is 0.
    id: "us7000abcf",
    source: "live",
    time: "2026-10-03T19:02:11Z",
    processedAt: "2026-10-03T19:02:40Z",
    magnitude: 4.3,
    depthKm: 35.0,
    latitude: 36.92,
    longitude: 141.35,
    place: "off the coast of Ibaraki, Japan",
    riskScore: 0,
    threshold: THRESHOLD,
    status: "scored",
    failureReason: null,
    payout: null,
  },
  {
    id: "us7000abcd",
    source: "live",
    time: "2026-10-03T18:55:02Z",
    processedAt: "2026-10-03T18:55:40Z",
    // M5.0 or above, so it went to the classifier, which didn't answer.
    magnitude: 5.4,
    depthKm: 41.2,
    latitude: 37.71,
    longitude: 141.92,
    place: "off the east coast of Fukushima, Japan",
    riskScore: null,
    threshold: THRESHOLD,
    status: "failed",
    failureReason: "CLASSIFIER_UNAVAILABLE",
    payout: null,
  },
  {
    id: "us7000abc1",
    source: "live",
    time: "2026-10-03T18:47:31Z",
    processedAt: "2026-10-03T18:48:05Z",
    magnitude: 5.2,
    depthKm: 58.4,
    latitude: 39.64,
    longitude: 142.51,
    place: "near Miyako, Iwate, Japan",
    riskScore: 22,
    threshold: THRESHOLD,
    status: "scored",
    failureReason: null,
    payout: null,
  },
  {
    id: "tohoku-2011-m91",
    source: "replay",
    time: "2011-03-11T05:46:24Z",
    processedAt: "2026-10-03T18:42:10Z",
    magnitude: 9.1,
    depthKm: 29.0,
    latitude: 38.297,
    longitude: 142.373,
    place: "2011 Great Tohoku Earthquake, Japan",
    riskScore: 100,
    threshold: THRESHOLD,
    status: "paid",
    failureReason: null,
    payout: {
      signature: PAID_SIGNATURE,
      // One payout at the demo pool's 0.1 SOL cap (api.md 5.6).
      amountLamports: 100000000,
      explorerUrl: explorerTxUrl(PAID_SIGNATURE),
      confirmedAt: "2026-10-03T18:42:11Z",
    },
  },
];

// The four demo scenarios, exactly as api.md 3.6 lists them.
export const scenariosFixture: ReplayScenario[] = [
  {
    id: "jp-2025-m48",
    label: "Small offshore quake, too weak to score (M4.8, 2025)",
    magnitude: 4.8,
    expectedOutcome: "no_payout",
  },
  {
    id: "jp-2013-m69-deep",
    label: "Deep inland quake near Obihiro (M6.9, 107 km, 2013)",
    magnitude: 6.9,
    expectedOutcome: "no_payout",
  },
  {
    id: "jp-2022-m73",
    label: "Fukushima offshore quake (M7.3, 2022)",
    magnitude: 7.3,
    expectedOutcome: "payout",
  },
  {
    id: "tohoku-2011-m91",
    label: "Great Tohoku earthquake (M9.1, 2011)",
    magnitude: 9.1,
    expectedOutcome: "payout",
  },
];

// Event details behind each scenario, used to build replayed events.
// Scores are model-v1's from requirements.md section 13; jp-2025-m48 is
// below M5.0, so it is never scored (riskScore 0). Coordinates and depth for
// jp-2022-m73 come from api.md section 4, and Tohoku from section 3.4. The
// times, and the location of jp-2025-m48, are approximate: the spec does not
// give them, and in real use they come from the oracle.
export const scenarioEventFixtures: Record<
  string,
  Pick<
    QuakeEvent,
    "time" | "magnitude" | "depthKm" | "latitude" | "longitude" | "place"
  > & { riskScore: number }
> = {
  "jp-2025-m48": {
    time: "2025-06-01T03:12:00Z",
    magnitude: 4.8,
    depthKm: 40.0,
    latitude: 36.4,
    longitude: 141.6,
    place: "off the east coast of Honshu, Japan",
    riskScore: 0,
  },
  "jp-2013-m69-deep": {
    time: "2013-02-02T14:17:35Z",
    magnitude: 6.9,
    depthKm: 107.0,
    latitude: 42.77,
    longitude: 143.087,
    place: "near Obihiro, Hokkaido, Japan",
    riskScore: 59,
  },
  "jp-2022-m73": {
    time: "2022-03-16T14:36:33Z",
    magnitude: 7.3,
    depthKm: 41.0,
    latitude: 37.7132,
    longitude: 141.5793,
    place: "off the coast of Fukushima, Japan",
    riskScore: 95,
  },
  "tohoku-2011-m91": {
    time: "2011-03-11T05:46:24Z",
    magnitude: 9.1,
    depthKm: 29.0,
    latitude: 38.297,
    longitude: 142.373,
    place: "2011 Great Tohoku Earthquake, Japan",
    riskScore: 100,
  },
};
