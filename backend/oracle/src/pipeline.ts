import type { Bounds } from "./config.js";
import { ChainError, type Chain } from "./chain.js";
import { ClassifierError, type Classifier } from "./classifier.js";
import { ApiError } from "./errors.js";
import { inRegion } from "./region.js";
import type { EventStore } from "./store.js";
import type { Payout, QuakeEvent, QuakeInput, Scenario } from "./types.js";

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
//
// An event is only stored once it has been scored, so a stored event has a riskScore
// unless its status is "failed" (docs/api.md §3.1).
export class Pipeline {
  private threshold: { value: number; fetchedAt: number } | null = null;
  // IDs being scored but not stored yet; they count as already seen.
  private inFlight = new Set<string>();
  private readonly log: (msg: string) => void;

  constructor(private readonly deps: PipelineDeps) {
    this.log = deps.log ?? ((msg) => console.log(`[pipeline] ${msg}`));
  }

  // Called for each feature in the live feed. Already-seen and out-of-region events are skipped.
  // Resolves once the event is final, including payout confirmation.
  async processLive(input: QuakeInput): Promise<void> {
    const id = input.usgsId;
    if (this.seen(id)) return;
    if (!inRegion(this.deps.bounds, input.latitude, input.longitude)) return;
    const { confirmation } = await this.process(id, "live", input);
    await confirmation;
  }

  // Scores a replayed scenario and returns the event as "scored", "pending" or "failed"
  // (docs/api.md §3.7). A pending payout keeps confirming in the background.
  async replay(scenario: Scenario, runId?: string): Promise<QuakeEvent> {
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
    if (this.seen(id)) {
      throw new ApiError("EVENT_ALREADY_PROCESSED", `Event '${id}' was already processed.`);
    }
    const { input } = scenario;
    if (!inRegion(this.deps.bounds, input.latitude, input.longitude)) {
      throw new ApiError("INVALID_REQUEST", `Scenario '${scenario.id}' is outside the pool region.`);
    }
    const { event } = await this.process(id, "replay", input);
    return event;
  }

  // After a restart: settle payouts that were in flight.
  async recover(): Promise<void> {
    const { store, chain } = this.deps;
    for (const e of store.all()) {
      if (e.status !== "pending" || !e.payout) continue;
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
    }
  }

  private seen(id: string): boolean {
    return this.deps.store.has(id) || this.inFlight.has(id);
  }

  // Resolves once the event is stored as scored, pending or failed. `confirmation` settles
  // when a pending payout is confirmed or fails; it never rejects.
  private async process(
    id: string,
    source: QuakeEvent["source"],
    input: QuakeInput,
  ): Promise<{ event: QuakeEvent; confirmation: Promise<void> }> {
    const draft = this.draft(id, source, input);
    this.log(`${source} ${id}: M${input.magnitude} ${input.place}`);
    this.inFlight.add(id);
    try {
      return await this.scoreAndSubmit(draft, input);
    } catch (err) {
      const event = this.record(draft, { status: "failed", failureReason: "INTERNAL_ERROR" }, err);
      return { event, confirmation: Promise.resolve() };
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async scoreAndSubmit(draft: QuakeEvent, input: QuakeInput) {
    const { classifier, chain, minMagnitude } = this.deps;
    const id = draft.id;
    const done = (patch: Partial<QuakeEvent>, err?: unknown) => ({
      event: this.record(draft, patch, err),
      confirmation: Promise.resolve(),
    });

    let threshold: number;
    try {
      threshold = await this.getThreshold();
    } catch (err) {
      return done({ status: "failed", failureReason: "SOLANA_UNAVAILABLE" }, err);
    }

    if (input.magnitude < minMagnitude) {
      this.log(`${id}: below M${minMagnitude}, not scored`);
      return done({ threshold, riskScore: 0 });
    }

    let riskScore: number;
    try {
      const result = await classifier.score(id, input);
      riskScore = result.riskScore;
      this.log(`${id}: score ${riskScore} / threshold ${threshold} (${result.modelVersion})`);
    } catch (err) {
      const reason = err instanceof ClassifierError ? err.reason : "CLASSIFIER_UNAVAILABLE";
      return done({ threshold, status: "failed", failureReason: reason }, err);
    }
    const scored = { threshold, riskScore };
    if (riskScore < threshold) return done(scored);

    // The program also rejects a repeated event ID; checking first avoids a failed transaction.
    if (await chain.payoutExists(id)) {
      return done({ ...scored, status: "failed", failureReason: "PAYOUT_ALREADY_EXISTS" });
    }

    let signature: string;
    try {
      signature = await chain.triggerPayout(id, riskScore);
    } catch (err) {
      return done({ ...scored, status: "failed", failureReason: chainErrorName(err) }, err);
    }
    const payout = {
      signature,
      amountLamports: 0,
      explorerUrl: chain.explorerUrl(signature),
      confirmedAt: null,
    };
    const event = this.record(draft, { ...scored, status: "pending", payout });
    this.log(`${id}: payout sent ${signature}`);
    return { event, confirmation: this.confirm(id, signature, payout) };
  }

  private async confirm(id: string, signature: string, payout: Payout): Promise<void> {
    try {
      const { confirmedAt, amountLamports } = await this.deps.chain.waitForConfirmation(signature, id);
      this.deps.store.update(id, { status: "paid", payout: { ...payout, amountLamports, confirmedAt } });
      this.log(`${id}: paid ${amountLamports} lamports`);
    } catch (err) {
      this.record(this.deps.store.get(id)!, { status: "failed", failureReason: chainErrorName(err) }, err);
    }
  }

  private draft(id: string, source: QuakeEvent["source"], q: QuakeInput): QuakeEvent {
    return {
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
  }

  // Stores the event the first time, updates it afterwards.
  private record(draft: QuakeEvent, patch: Partial<QuakeEvent>, err?: unknown): QuakeEvent {
    const { store } = this.deps;
    let event: QuakeEvent;
    if (store.has(draft.id)) {
      event = store.update(draft.id, patch);
    } else {
      event = { ...draft, ...patch };
      store.insert(event);
    }
    if (event.status === "failed") {
      const detail = err instanceof Error ? `: ${err.message}` : "";
      this.log(`${event.id}: failed ${event.failureReason}${detail}`);
    }
    return event;
  }

  private async getThreshold(): Promise<number> {
    const cached = this.threshold;
    if (cached && Date.now() - cached.fetchedAt < THRESHOLD_CACHE_MS) return cached.value;
    const value = await this.deps.chain.getThreshold();
    this.threshold = { value, fetchedAt: Date.now() };
    return value;
  }
}

function chainErrorName(err: unknown): string {
  return err instanceof ChainError ? err.errorName : "TRANSACTION_FAILED";
}
