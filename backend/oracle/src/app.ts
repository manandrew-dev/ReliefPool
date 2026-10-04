import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Chain } from "./chain.js";
import type { Classifier } from "./classifier.js";
import type { Config } from "./config.js";
import { ApiError } from "./errors.js";
import type { Pipeline } from "./pipeline.js";
import { toScenarioSummary } from "./scenarios.js";
import type { EventStore } from "./store.js";
import type { EventStatus, Scenario } from "./types.js";

export interface AppDeps {
  config: Pick<
    Config,
    "corsOrigins" | "programId" | "poolAddress" | "vaultAddress" | "region" | "labels"
  >;
  store: EventStore;
  pipeline: Pipeline;
  classifier: Classifier;
  chain: Chain;
  scenarios: Scenario[];
  lastFeedPollAt: () => string | null;
}

const STATUSES: EventStatus[] = ["scored", "pending", "paid", "failed"];

// REST API for the frontend (docs/api.md §3), mounted at /api.
export function createApp(deps: AppDeps) {
  const { config, store, pipeline, classifier, chain, scenarios } = deps;
  const api = express.Router();

  api.get("/health", async (_req, res) => {
    const [classifierHealth, solana] = await Promise.all([classifier.health(), chain.status()]);
    res.json({
      status: "ok",
      classifier: classifierHealth.status,
      classifierModelVersion: classifierHealth.modelVersion,
      solana,
      lastFeedPollAt: deps.lastFeedPollAt(),
    });
  });

  api.get("/pool", (_req, res) => {
    res.json({
      programId: config.programId,
      poolAddress: config.poolAddress,
      vaultAddress: config.vaultAddress,
      cluster: "devnet",
      region: config.region,
      labels: config.labels,
    });
  });

  api.get("/events", (req, res) => {
    res.json({ events: store.query(parseEventQuery(req.query)) });
  });

  api.get("/events/:id", (req, res) => {
    const event = store.get(req.params.id);
    if (!event) throw new ApiError("EVENT_NOT_FOUND", `No event with id '${req.params.id}'.`);
    res.json(event);
  });

  api.get("/replay/scenarios", (_req, res) => {
    res.json({ scenarios: scenarios.map(toScenarioSummary) });
  });

  api.post("/replay", async (req, res) => {
    const { scenarioId, runId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof scenarioId !== "string" || !scenarioId) {
      throw new ApiError("INVALID_REQUEST", "scenarioId is required.");
    }
    if (runId !== undefined && (typeof runId !== "string" || !runId)) {
      throw new ApiError("INVALID_REQUEST", "runId must be a non-empty string.");
    }
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) {
      throw new ApiError("SCENARIO_NOT_FOUND", `No replay scenario with id '${scenarioId}'.`);
    }
    res.status(202).json(await pipeline.replay(scenario, runId));
  });

  const app = express();
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json());
  app.use("/api", api);
  app.use((_req, _res, next) => next(new ApiError("INVALID_REQUEST", "Unknown endpoint.")));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json(err.toBody());
      return;
    }
    // express.json() raises a 400 for a malformed body.
    if ((err as { type?: string }).type === "entity.parse.failed") {
      const e = new ApiError("INVALID_REQUEST", "Request body is not valid JSON.");
      res.status(e.status).json(e.toBody());
      return;
    }
    console.error(err);
    const e = new ApiError("INTERNAL_ERROR", "Internal error.");
    res.status(e.status).json(e.toBody());
  });
  return app;
}

function parseEventQuery(q: Request["query"]) {
  const limitRaw = q.limit === undefined ? "20" : String(q.limit);
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError("INVALID_REQUEST", "limit must be an integer from 1 to 100.");
  }
  const status = q.status === undefined ? undefined : String(q.status);
  if (status !== undefined && !STATUSES.includes(status as EventStatus)) {
    throw new ApiError("INVALID_REQUEST", `status must be one of ${STATUSES.join(", ")}.`);
  }
  const since = q.since === undefined ? undefined : String(q.since);
  if (since !== undefined && Number.isNaN(Date.parse(since))) {
    throw new ApiError("INVALID_REQUEST", "since must be an ISO 8601 timestamp.");
  }
  return { limit, status: status as EventStatus | undefined, since };
}
