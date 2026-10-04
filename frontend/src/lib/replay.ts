// Event IDs seed the payout record's address, and Solana caps a seed at
// 32 bytes (docs/api.md section 2).
export const MAX_EVENT_ID_BYTES = 32;

// The characters POST /replay accepts in a runId (api.md 3.7); anything
// else gets 400 INVALID_REQUEST.
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// A short run ID so each replay gets a fresh event ID: "r" plus the last
// six base-36 digits of the time, so at most 7 characters.
export function newRunId(now: number = Date.now()): string {
  return `r${now.toString(36).slice(-6)}`;
}

// The event ID the oracle gives a replay (api.md 3.7).
export function replayEventId(scenarioId: string, runId?: string): string {
  return runId ? `${scenarioId}-${runId}` : scenarioId;
}

export function eventIdBytes(eventId: string): number {
  return new TextEncoder().encode(eventId).length;
}
