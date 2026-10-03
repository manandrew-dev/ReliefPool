// The only module the UI uses to talk to the oracle service (docs/api.md
// section 3). With config.oracleMock on, responses come from fixtures.

import { config } from "../config";
import {
  THRESHOLD,
  eventsFixture,
  explorerTxUrl,
  healthFixture,
  poolFixture,
  scenarioEventFixtures,
  scenariosFixture,
} from "./fixtures";
import type {
  ApiErrorBody,
  ApiErrorCode,
  EventsQuery,
  EventsResponse,
  HealthResponse,
  PoolResponse,
  QuakeEvent,
  ReplayRequest,
  ReplayScenariosResponse,
} from "./types";

const REQUEST_TIMEOUT_MS = 5000;
const MOCK_LATENCY_MS = 150;

// "NETWORK_ERROR" is client-side only: the backend was unreachable or timed
// out, so there is no response body. Every other code comes from the backend.
export class OracleApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "NETWORK_ERROR";

  constructor(
    status: number,
    code: ApiErrorCode | "NETWORK_ERROR",
    message: string
  ) {
    super(message);
    this.name = "OracleApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.oracleUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new OracleApiError(
      0,
      "NETWORK_ERROR",
      cause instanceof Error ? cause.message : "Oracle service unreachable."
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new OracleApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `Request failed with status ${response.status}.`
    );
  }
  return body as T;
}

// Mock backend: in-memory copy of the fixtures, so replays show up in later
// GET /events calls the same way they would against the real service.
const mockEvents: QuakeEvent[] = structuredClone(eventsFixture);

function mockTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Stands in for on-chain confirmation: a payout that was "pending" when
// POST /replay responded shows as "paid" from the next GET /events on.
function confirmPendingMockPayouts() {
  for (const event of mockEvents) {
    if (event.status === "pending" && event.payout) {
      event.status = "paid";
      event.payout.confirmedAt = mockTimestamp();
    }
  }
}

function mockDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(value)), MOCK_LATENCY_MS)
  );
}

function mockReject(
  status: number,
  code: ApiErrorCode,
  message: string
): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new OracleApiError(status, code, message)),
      MOCK_LATENCY_MS
    )
  );
}

export function getHealth(): Promise<HealthResponse> {
  if (config.oracleMock) return mockDelay(healthFixture);
  return request("/health");
}

export function getPool(): Promise<PoolResponse> {
  if (config.oracleMock) return mockDelay(poolFixture);
  return request("/pool");
}

export function getEvents(query: EventsQuery = {}): Promise<EventsResponse> {
  if (config.oracleMock) {
    const limit = query.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return mockReject(400, "INVALID_REQUEST", "limit must be 1 to 100.");
    }
    confirmPendingMockPayouts();
    const events = mockEvents
      .filter((e) => !query.status || e.status === query.status)
      .filter((e) => !query.since || e.processedAt > query.since)
      .slice(0, limit);
    return mockDelay({ events });
  }

  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.status) params.set("status", query.status);
  if (query.since) params.set("since", query.since);
  const search = params.size > 0 ? `?${params}` : "";
  return request(`/events${search}`);
}

export function getReplayScenarios(): Promise<ReplayScenariosResponse> {
  if (config.oracleMock) return mockDelay({ scenarios: scenariosFixture });
  return request("/replay/scenarios");
}

// Resolves with the 202 Accepted QuakeEvent, already scored: "scored" below
// the threshold, "pending" once a payout is submitted, or "failed". The
// final "paid" status arrives through getEvents() polling (api.md 3.7).
// A replay without runId of an already handled scenario rejects with
// EVENT_ALREADY_PROCESSED (409).
export function postReplay(body: ReplayRequest): Promise<QuakeEvent> {
  if (config.oracleMock) return mockReplay(body);
  return request("/replay", { method: "POST", body: JSON.stringify(body) });
}

function mockReplay({ scenarioId, runId }: ReplayRequest): Promise<QuakeEvent> {
  const scenario = scenarioEventFixtures[scenarioId];
  if (!scenario) {
    return mockReject(
      404,
      "SCENARIO_NOT_FOUND",
      `No replay scenario with id '${scenarioId}'.`
    );
  }
  const id = runId ? `${scenarioId}-${runId}` : scenarioId;
  if (new TextEncoder().encode(id).length > 32) {
    return mockReject(400, "INVALID_REQUEST", "Event ID exceeds 32 bytes.");
  }
  if (mockEvents.some((e) => e.id === id)) {
    return mockReject(
      409,
      "EVENT_ALREADY_PROCESSED",
      `Event '${id}' was already processed.`
    );
  }

  const now = mockTimestamp();
  const { riskScore, ...quake } = scenario;
  const triggered = riskScore >= THRESHOLD;
  const signature = `mock-${id}`;
  const event: QuakeEvent = {
    id,
    source: "replay",
    ...quake,
    processedAt: now,
    riskScore,
    threshold: THRESHOLD,
    status: triggered ? "pending" : "scored",
    failureReason: null,
    payout: triggered
      ? {
          signature,
          amountLamports: 2000000000,
          explorerUrl: explorerTxUrl(signature),
          confirmedAt: null,
        }
      : null,
  };
  mockEvents.unshift(event);
  return mockDelay(event);
}
