// Oracle service REST types, copied from docs/api.md sections 2 and 3.
// Keep in sync with the doc; it is the contract with the backend.

export type EventStatus =
  | "scored" // below threshold, no payout
  | "pending" // payout transaction submitted, not yet confirmed
  | "paid" // payout confirmed on-chain
  | "failed"; // scoring or payout failed; see failureReason

export interface QuakeEvent {
  id: string; // USGS event ID, or a scenario ID for replays
  source: "live" | "replay";
  time: string; // when the earthquake occurred
  processedAt: string; // when the oracle scored it
  magnitude: number;
  depthKm: number;
  latitude: number;
  longitude: number;
  place: string; // human-readable, from USGS
  riskScore: number | null; // null only if scoring failed
  threshold: number; // pool threshold at the time of scoring
  status: EventStatus;
  failureReason: string | null;
  payout: Payout | null; // set when status is "pending" or "paid"
}

export interface Payout {
  signature: string; // transaction signature
  amountLamports: number;
  explorerUrl: string;
  confirmedAt: string | null; // null while pending
}

// GET /health (section 3.2)
export type DependencyStatus = "ok" | "down" | "mock";

export interface HealthResponse {
  status: string;
  classifier: DependencyStatus;
  classifierModelVersion: string | null; // null if the classifier is down
  solana: DependencyStatus;
  lastFeedPollAt: string | null; // null until the first successful USGS poll
}

// GET /pool (section 3.3)
export interface PoolResponse {
  // null until the program is deployed and the pool initialized (api.md 3.3)
  programId: string | null;
  poolAddress: string | null;
  vaultAddress: string | null;
  cluster: "devnet";
  region: {
    id: number;
    name: string;
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  };
  labels: Record<string, { name: string; role: "responder" | "contributor" }>;
}

// GET /events (section 3.4)
export interface EventsQuery {
  limit?: number; // default 20, maximum 100
  status?: EventStatus;
  since?: string; // only events processed after this time
}

export interface EventsResponse {
  events: QuakeEvent[];
}

// GET /replay/scenarios (section 3.6)
export interface ReplayScenario {
  id: string;
  label: string;
  magnitude: number;
  expectedOutcome: "payout" | "no_payout";
}

export interface ReplayScenariosResponse {
  scenarios: ReplayScenario[];
}

// POST /replay (section 3.7)
export interface ReplayRequest {
  scenarioId: string;
  runId?: string;
}

// Error shape (section 2)
export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "EVENT_NOT_FOUND"
  | "SCENARIO_NOT_FOUND"
  | "EVENT_ALREADY_PROCESSED"
  | "CLASSIFIER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
