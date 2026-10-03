import { useEffect, useState } from "react";
import { getHealth } from "../api/oracle";
import type { HealthResponse } from "../api/types";

const POLL_INTERVAL_MS = 10_000;

export type HealthState =
  | { status: "checking" }
  | { status: "online"; health: HealthResponse }
  | { status: "offline"; reason: string };

// Polls GET /health. Any failure, including the backend not running,
// reports offline instead of throwing.
export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ status: "checking" });

  useEffect(() => {
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
