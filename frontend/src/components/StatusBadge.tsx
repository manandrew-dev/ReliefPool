import type { EventStatus } from "../api/types";
import { STATUS_LABELS } from "../lib/events";

const BADGE_CLASSES: Record<EventStatus, string> = {
  scored: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pending:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
