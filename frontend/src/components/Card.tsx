import type { ReactNode } from "react";
import { describeError } from "../lib/errors";

interface CardProps {
  title: string;
  // Shown in the card's title row, e.g. a Contribute button.
  action?: ReactNode;
  hasData: boolean;
  loading: boolean;
  error?: Error;
  // When the shown data was loaded. Used for the stale notice on error.
  updatedAt?: Date;
  empty?: boolean;
  emptyMessage?: ReactNode;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
}

// Card frame with the shared states: a skeleton while the first load runs,
// an error with retry when there is nothing to show, an empty message, and
// a stale notice when a refresh fails but older data is still shown.
export function Card({
  title,
  action,
  hasData,
  loading,
  error,
  updatedAt,
  empty = false,
  emptyMessage,
  onRetry,
  className = "",
  children,
}: CardProps) {
  let body: ReactNode;
  if (!hasData && error) {
    body = (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-red-600">{describeError(error)}</p>
        {onRetry && (
          <button className="underline" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  } else if (!hasData && loading) {
    body = (
      <div className="flex animate-pulse flex-col gap-2" aria-busy="true">
        <div className="h-4 w-2/3 rounded bg-cream" />
        <div className="h-4 w-1/2 rounded bg-cream" />
      </div>
    );
  } else if (empty) {
    body = <p className="text-sm text-muted">{emptyMessage}</p>;
  } else {
    body = children;
  }

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border border-border-low bg-card p-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {action}
      </div>
      {hasData && error && (
        <p className="text-xs text-amber-700">
          Couldn't refresh ({describeError(error)})
          {updatedAt && `, showing data from ${updatedAt.toLocaleTimeString()}`}
          .
        </p>
      )}
      {body}
    </section>
  );
}
