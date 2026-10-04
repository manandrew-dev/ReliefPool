import type { EventStatus } from "../api/types";

const BADGES: Record<EventStatus, { label: string; className: string }> = {
  scored: {
    label: "No payout",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  pending: {
    label: "Confirming…",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  },
  paid: {
    label: "Paid",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const badge = BADGES[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
