// Fixture responses shaped exactly like the examples in docs/api.md section 3.
// Used by the oracle client while VITE_ORACLE_MOCK is on.

import { config } from "../config";
import { mockWallets } from "../mocks/wallets";
import type {
  HealthResponse,
  PoolResponse,
  QuakeEvent,
  ReplayScenario,
} from "./types";

export const THRESHOLD = 70;

const PAID_SIGNATURE =
  "5ae7Q5DpgZ1xWkrT3KRGNAckP4m1GgBJNE8JYLusq5bsrLugBREb3H5PvJPLeRLK";

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export const healthFixture: HealthResponse = {
  status: "ok",
  classifier: "ok",
  solana: "ok",
  lastFeedPollAt: "2026-10-03T18:42:00Z",
};

export const poolFixture: PoolResponse = {
  programId: config.programId,
  poolAddress: mockWallets.pool,
  vaultAddress: mockWallets.vault,
  cluster: "devnet",
  region: {
    id: 1,
    name: "Tohoku Coast, Japan",
    bounds: { minLat: 35, maxLat: 42, minLon: 139, maxLon: 146 },
  },
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
  },
};

// Newest first, as GET /events returns them.
export const eventsFixture: QuakeEvent[] = [
  {
    id: "us7000abcd",
    source: "live",
    time: "2026-10-03T18:55:02Z",
    processedAt: "2026-10-03T18:55:40Z",
    magnitude: 4.6,
    depthKm: 41.2,
    latitude: 37.71,
    longitude: 141.92,
    place: "off the east coast of Fukushima, Japan",
    riskScore: null,
    threshold: THRESHOLD,
    status: "failed",
    failureReason: "Classifier did not respond.",
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
    id: "replay-major-01",
    source: "replay",
    time: "2011-03-11T05:46:24Z",
    processedAt: "2026-10-03T18:42:10Z",
    magnitude: 9.1,
    depthKm: 29.0,
    latitude: 38.297,
    longitude: 142.373,
    place: "near the east coast of Honshu, Japan",
    riskScore: 97,
    threshold: THRESHOLD,
    status: "paid",
    failureReason: null,
    payout: {
      signature: PAID_SIGNATURE,
      amountLamports: 2000000000,
      explorerUrl: explorerTxUrl(PAID_SIGNATURE),
      confirmedAt: "2026-10-03T18:42:11Z",
    },
  },
];

export const scenariosFixture: ReplayScenario[] = [
  {
    id: "replay-minor-01",
    label: "Minor offshore quake",
    magnitude: 4.8,
    expectedOutcome: "no_payout",
  },
  {
    id: "replay-major-01",
    label: "Major subduction quake",
    magnitude: 9.1,
    expectedOutcome: "payout",
  },
];

// Event details behind each scenario, used to build replayed events.
export const scenarioEventFixtures: Record<
  string,
  Pick<
    QuakeEvent,
    "time" | "magnitude" | "depthKm" | "latitude" | "longitude" | "place"
  > & { riskScore: number }
> = {
  "replay-minor-01": {
    time: "2021-03-20T09:09:44Z",
    magnitude: 4.8,
    depthKm: 54.0,
    latitude: 38.47,
    longitude: 141.63,
    place: "off the coast of Miyagi, Japan",
    riskScore: 18,
  },
  "replay-major-01": {
    time: "2011-03-11T05:46:24Z",
    magnitude: 9.1,
    depthKm: 29.0,
    latitude: 38.297,
    longitude: 142.373,
    place: "near the east coast of Honshu, Japan",
    riskScore: 97,
  },
};
