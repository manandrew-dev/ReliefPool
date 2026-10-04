import { useHealth } from "../hooks/useHealth";

const DOT_CLASS = {
  mock: "bg-amber-500",
  checking: "bg-gray-400",
  online: "bg-green-500",
  offline: "bg-red-500",
} as const;

const LABEL = {
  mock: "Mock backend",
  checking: "Checking backend",
  online: "Backend online",
  offline: "Backend offline",
} as const;

export function HealthIndicator() {
  const state = useHealth();

  const detail =
    state.status === "online"
      ? `Classifier: ${state.health.classifier}, Solana: ${state.health.solana}. ${
          state.health.lastFeedPollAt
            ? `Last feed poll: ${new Date(state.health.lastFeedPollAt).toLocaleTimeString()}.`
            : "No feed poll yet."
        }`
      : state.status === "offline"
        ? state.reason
        : state.status === "mock"
          ? "VITE_ORACLE_MOCK is on: oracle data comes from fixtures."
          : undefined;

  return (
    <div
      className="flex items-center gap-2 text-sm text-muted"
      title={detail}
      role="status"
    >
      <span className={`size-2.5 rounded-full ${DOT_CLASS[state.status]}`} />
      {LABEL[state.status]}
    </div>
  );
}
