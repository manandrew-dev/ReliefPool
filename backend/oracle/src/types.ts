// Shapes shared with the frontend. Keep in sync with docs/api.md §3.1.

export type EventStatus = "scored" | "pending" | "paid" | "failed";

export interface Payout {
  signature: string;
  amountLamports: number;
  explorerUrl: string;
  confirmedAt: string | null;
}

export interface QuakeEvent {
  id: string;
  source: "live" | "replay";
  time: string;
  processedAt: string;
  magnitude: number;
  depthKm: number;
  latitude: number;
  longitude: number;
  place: string;
  riskScore: number | null;
  threshold: number;
  status: EventStatus;
  failureReason: string | null;
  payout: Payout | null;
}

// One earthquake as read from USGS, before the oracle processes it.
// Live and replayed events are both converted to this shape (see usgs.ts).
export interface QuakeInput {
  usgsId: string;
  time: string;
  magnitude: number;
  depthKm: number;
  latitude: number;
  longitude: number;
  place: string;
}

export interface Scenario {
  id: string;
  label: string;
  expectedOutcome: "payout" | "no_payout";
  input: QuakeInput;
}

export type DependencyStatus = "ok" | "down" | "mock";
