import type { HealthResponse } from "../api/types";

export interface HealthSummary {
  tone: "ok" | "warning";
  label: string;
  detail: string;
}

function dependencyText(status: string, version?: string | null): string {
  return version ? `${status} (${version})` : status;
}

// Turns a reachable GET /health response (api.md 3.2) into the header
// badge. Mocked or down dependencies are named in the label, because with a
// mock chain the payouts on screen are not real.
export function describeHealth(health: HealthResponse): HealthSummary {
  const parts: string[] = [];
  if (health.classifier === "down") parts.push("classifier down");
  if (health.solana === "down") parts.push("Solana down");

  const mocked: string[] = [];
  if (health.classifier === "mock") mocked.push("classifier");
  if (health.solana === "mock") mocked.push("chain");
  if (mocked.length > 0) parts.push(`mock ${mocked.join(" and ")}`);

  let label = "Backend online";
  if (parts.length > 0) {
    label = `Backend: ${parts.join(", ")}`;
    if (health.solana === "mock") label += ", payouts aren't real";
    else if (health.classifier === "mock") label += ", scores aren't real";
  }

  const lastPoll = health.lastFeedPollAt
    ? `Last feed poll: ${new Date(health.lastFeedPollAt).toLocaleTimeString()}.`
    : "No feed poll yet.";
  const detail =
    `Classifier: ${dependencyText(health.classifier, health.classifierModelVersion)}. ` +
    `Solana: ${dependencyText(health.solana)}. ${lastPoll}`;

  return { tone: parts.length > 0 ? "warning" : "ok", label, detail };
}
