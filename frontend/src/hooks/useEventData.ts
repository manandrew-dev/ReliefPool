import { useCallback, useEffect, useRef } from "react";
import * as oracle from "../api/oracle";
import type { QuakeEvent } from "../api/types";
import { useAsyncData } from "./useAsyncData";

// docs/api.md section 3.4: the frontend polls every 3 to 5 seconds.
const EVENTS_POLL_MS = 4_000;

function paidIds(...lists: (QuakeEvent[] | undefined)[]): string[] {
  return lists.flatMap(
    (events) =>
      events?.filter((e) => e.status === "paid").map((e) => e.id) ?? []
  );
}

// The event feed and the payout history (docs/api.md section 6), polled
// together. `onNewPayout` runs whenever an event shows up as "paid" that was
// not paid in an earlier poll, so the caller can refresh chain data. Events
// already paid on the first load do not trigger it.
export function useEventData(onNewPayout: () => void) {
  const feed = useAsyncData(
    "events",
    () => oracle.getEvents({ limit: 20 }),
    EVENTS_POLL_MS
  );
  const payouts = useAsyncData(
    "payouts",
    () => oracle.getEvents({ status: "paid", limit: 100 }),
    EVENTS_POLL_MS
  );

  const onNewPayoutRef = useRef(onNewPayout);
  useEffect(() => {
    onNewPayoutRef.current = onNewPayout;
  });

  // Null until both lists have loaded once, so existing payouts are seeded
  // silently.
  const seenPaid = useRef<Set<string> | null>(null);
  const feedEvents = feed.data?.events;
  const paidEvents = payouts.data?.events;

  useEffect(() => {
    if (!feedEvents || !paidEvents) return;
    const ids = paidIds(feedEvents, paidEvents);
    if (seenPaid.current === null) {
      seenPaid.current = new Set(ids);
      return;
    }
    const seen = seenPaid.current;
    const fresh = ids.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.add(id));
    onNewPayoutRef.current();
  }, [feedEvents, paidEvents]);

  const { refresh: refreshFeed } = feed;
  const { refresh: refreshPayouts } = payouts;
  const refresh = useCallback(() => {
    refreshFeed();
    refreshPayouts();
  }, [refreshFeed, refreshPayouts]);

  return { feed, payouts, refresh };
}

export type EventData = ReturnType<typeof useEventData>;
