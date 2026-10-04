import type { EventStatus, PoolResponse } from "../api/types";

type Bounds = PoolResponse["region"]["bounds"];

// Leaflet's LatLngBoundsExpression: south-west corner, then north-east.
export function regionCorners(
  bounds: Bounds
): [[number, number], [number, number]] {
  return [
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon],
  ];
}

// Marker radius in pixels. Magnitude is logarithmic, so a linear radius
// already makes an M9 stand out from an M5 without hiding the small ones.
// Clamped so an M3 is still clickable and nothing covers the whole region.
export function markerRadius(magnitude: number): number {
  const radius = 4 + (magnitude - 4) * 3;
  return Math.min(20, Math.max(4, radius));
}

// Same meaning as StatusBadge: green paid, amber confirming, red failed,
// grey no payout.
export const STATUS_COLORS: Record<EventStatus, string> = {
  scored: "#6b7280",
  pending: "#d97706",
  paid: "#16a34a",
  failed: "#dc2626",
};
