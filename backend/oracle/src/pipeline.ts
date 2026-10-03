import type { Bounds } from "./config.js";
import { ChainError, type Chain } from "./chain.js";
import { ClassifierError, type Classifier } from "./classifier.js";
import { ApiError } from "./errors.js";
import { inRegion } from "./region.js";
import type { EventStore } from "./store.js";
import type { QuakeEvent, QuakeInput, Scenario } from "./types.js";

export interface PipelineDeps {
  store: EventStore;
  classifier: Classifier;
  chain: Chain;
  bounds: Bounds;
  minMagnitude: number;
  // Shown on events if the chain cannot be read before the first successful threshold fetch.
  defaultThreshold: number;
  log?: (msg: string) => void;
}

// Solana caps each PDA seed at 32 bytes, and the event ID seeds the payout record.
const MAX_EVENT_ID_BYTES = 32;
const THRESHOLD_CACHE_MS = 30_000;
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

// Live and replayed events go through the same steps (FR-30):
// region -> magnitude -> classifier -> threshold -> trigger_payout -> confirmation.
// No step that fails can lead to a payout (NFR-7).
export class Pipeline {
  private threshold: { value: number; fetchedAt: number } | null = null;
  private readonly log: (msg: string) => void;

  constructor(private readonly deps: PipelineDeps) {
    this.log = deps.log ?? ((msg) => console.log(`[pipeline] ${msg}`));
  }

  // Called for each feature in the live feed. Already-seen and out-of-region events are skipped.
  async processLive(input: QuakeInput): Promise<void> {
    const { store, bounds } = this.deps;
    if (store.has(input.usgsId)) return;
    if (!inRegion(bounds, input.latitude, input.longitude)) return;
    const event = this.createEvent(input.usgsId, "live", input);
    await this.run(event.id, input);
  }

  // Starts a replay and returns the new event right away; processing continues in the background.
  startReplay(scenario: Scenario, runId?: string): QuakeEvent {
    if (runId !== undefined && !RUN_ID_PATTERN.test(runId)) {
      throw new ApiError("INVALID_REQUEST", "runId may only contain letters, digits, '-' and '_'.");
    }
    const id = runId ? `${scenario.id}-${runId}` : scenario.id;
    if (Buffer.byteLength(id) > MAX_EVENT_ID_BYTES) {
      throw new ApiError(
        "INVALID_REQUEST",
        `Event ID '${id}' is longer than ${MAX_EVENT_ID_BYTES} bytes; use a shorter runId.`,
      );
    }
    if (this.deps.store.has(id)) {
      throw new ApiError("EVENT_ALREADY_PROCESSED", `Event '${id}' was already processed.`);
    }
    const { input } = scenario;
    if (!inRegion(this.deps.bounds, input.latitude, input.longitude)) {
      throw new ApiError("INVALID_REQUEST", `Scenario '${scenario.id}' is outside the pool region.`);
    }
    const event = this.createEvent(id, "replay", input);
    void this.run(id, input);
    return event;
  }

  // After a restart: settle payouts that were in flight and fail events cut off mid-scoring.
  async recover(): Promise<void> {
    const { store, chain } = this.deps;
    for (const e of store.all()) {
      if (e.status === "pending" && e.payout) {
        const state = await chain.signatureState(e.payout.signature).catch(() => "unknown" as const);
        if (state === "confirmed") {
          store.update(e.id, {
            status: "paid",
            payout: { ...e.payout, confirmedAt: e.payout.confirmedAt ?? isoNow() },
          });
        } else if (state === "failed") {
          store.update(e.id, { status: "failed", failureReason: "TRANSACTION_FAILED" });
        }
        this.log(`recovered ${e.id}: ${state}`);
      } else if (e.status === "scored" && e.riskScore === null) {
        store.update(e.id, { status: "failed", failureReason: "INTERRUPTED_BY_RESTART" });
        this.log(`recovered ${e.id}: interrupted`);
      }
    }
  }

  private createEvent(id: string, source: QuakeEvent["source"], q: QuakeInput): QuakeEvent {
    const event: QuakeEvent = {
      id,
      source,
      time: q.time,
      processedAt: isoNow(),
      magnitude: q.magnitude,
      depthKm: q.depthKm,
      latitude: q.latitude,
      longitude: q.longitude,
      place: q.place,
      riskScore: null,
      threshold: this.threshold?.value ?? this.deps.defaultThreshold,
      status: "scored",
      failureReason: null,
      payout: null,
    };
    this.deps.store.insert(event);
    this.log(`${source} ${id}: M${q.magnitude} ${q.place}`);
    return event;
  }

  private async run(id: string, input: QuakeInput): Promise<void> {
    try {
      await this.runSteps(id, input);
    } catch (err) {
      this.fail(id, "INTERNAL_ERROR", err);
    }
  }

  private async runSteps(id: string, input: QuakeInput): Promise<void> {
    const { store, classifier, chain, minMagnitude } = this.deps;

    let threshold: number;
    try {
      threshold = await this.getThreshold();
    } catch (err) {
      return this.fail(id, "SOLANA_UNAVAILABLE", err);
    }
    store.update(id, { threshold });

    if (input.magnitude < minMagnitude) {
      store.update(id, { riskScore: 0 });
      this.log(`${id}: below M${minMagnitude}, not scored`);
      return;
    }

    let riskScore: number;
    try {
      const result = await classifier.score(id, input);
      riskScore = result.riskScore;
      this.log(`${id}: score ${riskScore} / threshold ${threshold} (${result.modelVersion})`);
    } catch (err) {
      const reason = err instanceof ClassifierError ? err.reason : "CLASSIFIER_UNAVAILABLE";
      return this.fail(id, reason, err);
    }
    store.update(id, { riskScore });
    if (riskScore < threshold) return;

    // The program also rejects a repeated event ID; checking first avoids a failed transaction.
    if (await chain.payoutExists(id)) {
      return this.fail(id, "PAYOUT_ALREADY_EXISTS");
    }

    let signature: string;
    try {
      signature = await chain.triggerPayout(id, riskScore);
    } catch (err) {
      return this.fail(id, chainErrorName(err), err);
    }
    const payout = {
      signature,
      amountLamports: 0,
      explorerUrl: chain.explorerUrl(signature),
      confirmedAt: null,
    };
    store.update(id, { status: "pending", payout });
    this.log(`${id}: payout sent ${signature}`);

    try {
      const { confirmedAt, amountLamports } = await chain.waitForConfirmation(signature, id);
      store.update(id, { status: "paid", payout: { ...payout, amountLamports, confirmedAt } });
      this.log(`${id}: paid ${amountLamports} lamports`);
    } catch (err) {
      this.fail(id, chainErrorName(err), err);
    }
  }

  private async getThreshold(): Promise<number> {
    const cached = this.threshold;
    if (cached && Date.now() - cached.fetchedAt < THRESHOLD_CACHE_MS) return cached.value;
    const value = await this.deps.chain.getThreshold();
    this.threshold = { value, fetchedAt: Date.now() };
    return value;
  }

  private fail(id: string, reason: string, err?: unknown): void {
    this.deps.store.update(id, { status: "failed", failureReason: reason });
    const detail = err instanceof Error ? `: ${err.message}` : "";
    this.log(`${id}: failed ${reason}${detail}`);
  }
}

function chainErrorName(err: unknown): string {
  return err instanceof ChainError ? err.errorName : "TRANSACTION_FAILED";
}
