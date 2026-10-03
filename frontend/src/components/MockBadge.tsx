import { config } from "../config";
import { isMock as programIsMock } from "../program/client";

// Shown whenever any data on the page is mocked: oracle responses from
// fixtures (VITE_ORACLE_MOCK is anything other than "false") or chain data
// from the mock program client.
export function MockBadge() {
  const mocked = [
    config.oracleMock && "oracle data (fixtures, VITE_ORACLE_MOCK)",
    programIsMock && "chain data (mock program client)",
  ].filter(Boolean);
  if (mocked.length === 0) return null;

  return (
    <span
      className="rounded-full border border-amber-500 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
      title={`Mocked: ${mocked.join(" and ")}.`}
    >
      Mock data
    </span>
  );
}
