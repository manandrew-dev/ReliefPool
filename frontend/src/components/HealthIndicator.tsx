import { useHealth } from "../hooks/useHealth";
import { describeHealth } from "../lib/health";

const DOT_CLASS = {
  ok: "bg-green-500",
  warning: "bg-amber-500",
  checking: "bg-gray-400",
  offline: "bg-red-500",
} as const;

export function HealthIndicator() {
  const state = useHealth();

  let dot: keyof typeof DOT_CLASS;
  let label: string;
  let detail: string | undefined;
  switch (state.status) {
    case "mock":
      dot = "warning";
      label = "Mock backend";
      detail = "VITE_ORACLE_MOCK is on: oracle data comes from fixtures.";
      break;
    case "checking":
      dot = "checking";
      label = "Checking backend";
      break;
    case "offline":
      dot = "offline";
      label = "Backend offline";
      detail = state.reason;
      break;
    case "online": {
      const summary = describeHealth(state.health);
      dot = summary.tone;
      label = summary.label;
      detail = summary.detail;
      break;
    }
  }

  return (
    <div
      className="flex items-center gap-2 text-sm text-muted"
      title={detail}
      role="status"
    >
      <span className={`size-2.5 rounded-full ${DOT_CLASS[dot]}`} />
      {label}
    </div>
  );
}
