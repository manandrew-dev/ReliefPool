import { config } from "../config";

// Shown whenever oracle responses come from fixtures (VITE_ORACLE_MOCK is
// anything other than "false").
export function MockBadge() {
  if (!config.oracleMock) return null;
  return (
    <span
      className="rounded-full border border-amber-500 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
      title="Oracle data comes from fixtures, not the backend. Set VITE_ORACLE_MOCK=false to use the real service."
    >
      Mock data
    </span>
  );
}
