import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncData<T> {
  data: T | undefined;
  error: Error | undefined;
  // True until the first load for the current key settles.
  loading: boolean;
  // When data was last loaded successfully. With an error set, data is stale.
  updatedAt: Date | undefined;
  refresh: () => void;
}

interface State<T> {
  key: string | null;
  data: T | undefined;
  error: Error | undefined;
  updatedAt: Date | undefined;
  settled: boolean;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Loads data with `fetcher` and reloads it when `key` changes, on
// `refresh()`, and every `intervalMs` if given. A null key disables loading.
// A failed reload keeps the last good data and sets `error` next to it.
export function useAsyncData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  intervalMs?: number
): AsyncData<T> {
  const [state, setState] = useState<State<T>>({
    key,
    data: undefined,
    error: undefined,
    updatedAt: undefined,
    settled: false,
  });

  // Data from a previous key must not show under a new one.
  if (state.key !== key) {
    setState({
      key,
      data: undefined,
      error: undefined,
      updatedAt: undefined,
      settled: false,
    });
  }

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Only the latest request may update state, so a slow response cannot
  // overwrite a newer one.
  const requestId = useRef(0);

  const load = useCallback(() => {
    if (key === null) return;
    const id = ++requestId.current;
    fetcherRef.current().then(
      (data) => {
        if (id !== requestId.current) return;
        setState({
          key,
          data,
          error: undefined,
          updatedAt: new Date(),
          settled: true,
        });
      },
      (error: unknown) => {
        if (id !== requestId.current) return;
        setState((prev) => ({
          ...prev,
          key,
          error: toError(error),
          settled: true,
        }));
      }
    );
  }, [key]);

  useEffect(() => {
    load();
    const timer =
      key !== null && intervalMs ? setInterval(load, intervalMs) : undefined;
    // The ref object itself, not a snapshot of .current: the cleanup must
    // invalidate whatever request is latest when it runs.
    const requests = requestId;
    return () => {
      clearInterval(timer);
      // Drop responses that arrive after the key changed or on unmount.
      requests.current++;
    };
  }, [key, intervalMs, load]);

  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: key !== null && !(current && state.settled),
    updatedAt: current ? state.updatedAt : undefined,
    refresh: load,
  };
}
