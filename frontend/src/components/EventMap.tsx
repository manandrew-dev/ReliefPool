import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { EventStatus, QuakeEvent } from "../api/types";
import { combineAsync } from "../hooks/useAsyncData";
import type { EventData } from "../hooks/useEventData";
import type { PoolData } from "../hooks/usePoolData";
import { STATUS_LABELS, describeEventOutcome } from "../lib/events";
import { formatRelativeTime } from "../lib/format";
import { STATUS_COLORS, markerRadius, regionCorners } from "../lib/map";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";

const LEGEND: EventStatus[] = ["paid", "pending", "scored", "failed"];

// Leaflet measures its container once. The card stretches to match the feed
// beside it, so re-measure on every resize or the new area stays blank.
function FollowContainerSize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function EventMarker({ event }: { event: QuakeEvent }) {
  const color = STATUS_COLORS[event.status];
  return (
    <CircleMarker
      center={[event.latitude, event.longitude]}
      radius={markerRadius(event.magnitude)}
      pathOptions={{
        color,
        fillColor: color,
        fillOpacity: 0.45,
        weight: 2,
      }}
    >
      <Popup>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <strong>{event.place}</strong>
            <StatusBadge status={event.status} />
          </div>
          <span>
            M{event.magnitude.toFixed(1)} · {event.depthKm.toFixed(0)} km deep ·{" "}
            {event.source === "replay"
              ? "replay"
              : formatRelativeTime(event.time)}
          </span>
          <span>{describeEventOutcome(event)}</span>
        </div>
      </Popup>
    </CircleMarker>
  );
}

// The pool's region and the events in the feed on a map (FR-29). The region
// comes from GET /pool and the events from GET /events, both already loaded
// for the other cards; the oracle stores only in-region quakes, so every
// marker falls inside the box.
export function EventMap({
  poolInfo,
  feed,
}: {
  poolInfo: PoolData["info"];
  feed: EventData["feed"];
}) {
  const state = combineAsync(poolInfo, feed);
  const region = poolInfo.data?.region;
  // Oldest first, so the newest marker is drawn on top.
  const events = [...(feed.data?.events ?? [])].reverse();

  return (
    <Card title="Earthquake map" {...state}>
      {region && (
        <>
          <MapContainer
            bounds={regionCorners(region.bounds)}
            boundsOptions={{ padding: [16, 16] }}
            scrollWheelZoom={false}
            // isolate: Leaflet panes use z-indexes up to 1000, which would
            // otherwise draw over the Contribute modal.
            className="isolate min-h-80 flex-1 rounded-lg"
          >
            <FollowContainerSize />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Rectangle
              bounds={regionCorners(region.bounds)}
              pathOptions={{ color: "#2563eb", weight: 1.5, fillOpacity: 0.06 }}
            >
              <Tooltip sticky>{region.name}: the pool's region</Tooltip>
            </Rectangle>
            {events.map((event) => (
              <EventMarker key={event.id} event={event} />
            ))}
          </MapContainer>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm border border-blue-600 bg-blue-600/10" />
              {region.name}
            </li>
            {LEGEND.map((status) => (
              <li key={status} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                {STATUS_LABELS[status]}
              </li>
            ))}
            <li>Larger circle, larger magnitude</li>
          </ul>
        </>
      )}
    </Card>
  );
}
