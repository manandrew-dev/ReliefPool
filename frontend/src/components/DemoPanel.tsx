import { useRef, useState } from "react";
import * as oracle from "../api/oracle";
import type { QuakeEvent, ReplayScenario } from "../api/types";
import { useAsyncData } from "../hooks/useAsyncData";
import { describeReplayError, isAlreadyProcessed } from "../lib/errors";
import { describeEventOutcome } from "../lib/events";
import {
  MAX_EVENT_ID_BYTES,
  eventIdBytes,
  newRunId,
  replayEventId,
} from "../lib/replay";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";

type Outcome =
  | { kind: "event"; id: string }
  | { kind: "duplicate"; id: string }
  | { kind: "error"; message: string };

// Replays historical earthquakes through the same pipeline as live events
// (docs/api.md sections 3.6 and 3.7). The result follows the event's live
// status in the feed, so a pending payout turns into Paid here too.
export function DemoPanel({
  feedEvents,
  onReplayed,
}: {
  feedEvents: QuakeEvent[] | undefined;
  onReplayed: () => void;
}) {
  const scenarios = useAsyncData("replay-scenarios", oracle.getReplayScenarios);
  const [freshId, setFreshId] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [lastEvent, setLastEvent] = useState<QuakeEvent | null>(null);
  // Set synchronously so a second click before re-render cannot replay twice.
  const inFlight = useRef(false);

  async function replay(scenario: ReplayScenario) {
    if (inFlight.current) return;
    const runId = freshId ? newRunId() : undefined;
    const eventId = replayEventId(scenario.id, runId);
    if (eventIdBytes(eventId) > MAX_EVENT_ID_BYTES) {
      setOutcome({
        kind: "error",
        message: `Event ID "${eventId}" is longer than ${MAX_EVENT_ID_BYTES} bytes.`,
      });
      return;
    }

    inFlight.current = true;
    setBusyId(scenario.id);
    try {
      const event = await oracle.postReplay({ scenarioId: scenario.id, runId });
      setLastEvent(event);
      setOutcome({ kind: "event", id: event.id });
      onReplayed();
    } catch (error) {
      if (isAlreadyProcessed(error)) {
        setOutcome({ kind: "duplicate", id: eventId });
      } else {
        setOutcome({ kind: "error", message: describeReplayError(error) });
      }
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }

  const list = scenarios.data?.scenarios ?? [];
  const current =
    outcome?.kind === "event"
      ? (feedEvents?.find((e) => e.id === outcome.id) ?? lastEvent)
      : null;

  return (
    <Card
      title="Demo: replay a historical earthquake"
      hasData={scenarios.data !== undefined}
      loading={scenarios.loading}
      error={scenarios.error}
      updatedAt={scenarios.updatedAt}
      onRetry={scenarios.refresh}
      empty={list.length === 0}
      emptyMessage="No replay scenarios are configured on the backend."
    >
      <p className="text-sm text-muted">
        Replays go through the same scoring and payout pipeline as live events.
      </p>

      <ul className="flex flex-col gap-2">
        {list.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-low p-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted">
                M{s.magnitude.toFixed(1)} · expected:{" "}
                {s.expectedOutcome === "payout" ? "payout" : "no payout"}
              </p>
            </div>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-background disabled:opacity-50"
              onClick={() => replay(s)}
              disabled={busyId !== null}
            >
              {busyId === s.id ? "Replaying…" : "Replay"}
            </button>
          </li>
        ))}
      </ul>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={freshId}
          onChange={(e) => setFreshId(e.target.checked)}
        />
        <span>
          Use a fresh event ID for each replay
          <span className="block text-xs text-muted">
            Turn off to replay with the scenario's own ID and see the
            double-payout protection reject a repeat.
          </span>
        </span>
      </label>

      {outcome && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-md bg-cream p-3 text-sm"
        >
          {outcome.kind === "event" && current && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs">{current.id}</span>
                <StatusBadge status={current.status} />
              </div>
              <p>{describeEventOutcome(current)}</p>
            </>
          )}
          {outcome.kind === "duplicate" && (
            <>
              <span className="font-mono text-xs">{outcome.id}</span>
              <p>
                <strong>Already processed: double payout blocked.</strong> This
                event ID was handled before, so the backend refused to process
                it again (409).
              </p>
            </>
          )}
          {outcome.kind === "error" && (
            <p className="text-red-600">{outcome.message}</p>
          )}
        </div>
      )}
    </Card>
  );
}
