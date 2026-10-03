import type { DependencyStatus, QuakeInput } from "./types.js";

// Contract: docs/ReliefPool_ML_Oracle_Interface_Contract.docx (Keith), summarized in docs/api.md §4.

export interface ScoreResult {
  riskScore: number;
  modelVersion: string;
}

export interface ClassifierHealth {
  status: DependencyStatus;
  modelVersion: string | null;
}

export interface Classifier {
  score(eventId: string, input: QuakeInput): Promise<ScoreResult>;
  health(): Promise<ClassifierHealth>;
}

// Becomes the event's failureReason. None of these may be treated as low risk.
export type ClassifierFailure =
  | "CLASSIFIER_UNAVAILABLE" // no answer, 5xx, or timeout; retried once
  | "CLASSIFIER_REJECTED" // 4xx: the classifier refused the input; not retried
  | "CLASSIFIER_INVALID_RESPONSE"; // answered, but outside the contract; not retried

export class ClassifierError extends Error {
  constructor(readonly reason: ClassifierFailure, message: string) {
    super(message);
  }
}

// Exactly the five fields in the contract (§3–4); nothing else is sent.
export function scoreRequest(eventId: string, q: QuakeInput) {
  return {
    eventId,
    magnitude: q.magnitude,
    depthKm: q.depthKm,
    latitude: q.latitude,
    longitude: q.longitude,
  };
}

const SCORE_TIMEOUT_MS = 3000;
const HEALTH_TIMEOUT_MS = 1500;

export class HttpClassifier implements Classifier {
  constructor(private readonly baseUrl: string) {}

  async score(eventId: string, input: QuakeInput): Promise<ScoreResult> {
    try {
      return await this.scoreOnce(eventId, input);
    } catch (err) {
      if (err instanceof ClassifierError && err.reason !== "CLASSIFIER_UNAVAILABLE") throw err;
      return await this.scoreOnce(eventId, input); // one retry, only when unavailable
    }
  }

  private async scoreOnce(eventId: string, input: QuakeInput): Promise<ScoreResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scoreRequest(eventId, input)),
        signal: AbortSignal.timeout(SCORE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ClassifierError("CLASSIFIER_UNAVAILABLE", errorMessage(err));
    }
    if (res.status >= 400 && res.status < 500) {
      throw new ClassifierError("CLASSIFIER_REJECTED", `HTTP ${res.status}: ${await res.text()}`);
    }
    if (!res.ok) {
      throw new ClassifierError("CLASSIFIER_UNAVAILABLE", `HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return parseScoreResponse(eventId, body);
  }

  async health(): Promise<ClassifierHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!res.ok) return { status: "down", modelVersion: null };
      const body = (await res.json()) as { status?: unknown; modelVersion?: unknown };
      return {
        status: body.status === "ok" ? "ok" : "down",
        modelVersion: typeof body.modelVersion === "string" ? body.modelVersion : null,
      };
    } catch {
      return { status: "down", modelVersion: null };
    }
  }
}

// Checks the contract's response rules (§5): eventId echoed exactly, integer riskScore 0–100,
// modelVersion present.
export function parseScoreResponse(eventId: string, body: Record<string, unknown> | null): ScoreResult {
  const invalid = (why: string) => new ClassifierError("CLASSIFIER_INVALID_RESPONSE", why);
  if (!body) throw invalid("response is not JSON");
  if (body.eventId !== eventId) {
    throw invalid(`eventId ${JSON.stringify(body.eventId)} does not match ${JSON.stringify(eventId)}`);
  }
  const { riskScore, modelVersion } = body;
  if (typeof riskScore !== "number" || !Number.isInteger(riskScore) || riskScore < 0 || riskScore > 100) {
    throw invalid(`riskScore ${JSON.stringify(riskScore)} is not an integer from 0 to 100`);
  }
  if (typeof modelVersion !== "string" || !modelVersion) {
    throw invalid("modelVersion is missing");
  }
  return { riskScore, modelVersion };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Stand-in for Keith's service, for working offline. With threshold 70 the demo scenarios score:
// Hokkaido 2013 M6.9 at 107 km -> 27, Fukushima 2022 M7.3 at 41 km -> 77, Tohoku 2011 -> 100.
export class MockClassifier implements Classifier {
  async score(_eventId: string, q: QuakeInput): Promise<ScoreResult> {
    const raw = (q.magnitude - 6) * 70 - q.depthKm / 3;
    return { riskScore: Math.max(0, Math.min(100, Math.round(raw))), modelVersion: "mock" };
  }

  async health(): Promise<ClassifierHealth> {
    return { status: "mock", modelVersion: "mock" };
  }
}
