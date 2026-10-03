import { useEffect, useState } from "react";
import { getHealth } from "../api/oracle";
import { config } from "../config";
import type { HealthResponse } from "../api/types";

const POLL_INTERVAL_MS = 10_000;

export type HealthState =
  | { status: "mock" }
  | { status: "checking" }
  | { status: "online"; health: HealthResponse }
  | { status: "offline"; reason: string };

// Polls GET /health. Any failure, including the backend not running,
// reports offline instead of throwing. In mock mode there is no backend to
// check, so it reports "mock" and never polls.
export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>(
    config.oracleMock ? { status: "mock" } : { status: "checking" }
  );

  useEffect(() => {
    if (config.oracleMock) return;
    let cancelled = false;

    async function check() {
      try {
        const health = await getHealth();
        if (cancelled) return;
        setState(
          health.status === "ok"
            ? { status: "online", health }
            : { status: "offline", reason: `Backend status: ${health.status}` }
        );
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "offline",
          reason:
            error instanceof Error
              ? error.message
              : "Oracle service unreachable.",
        });
      }
    }

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}
