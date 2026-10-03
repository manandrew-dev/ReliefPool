import type { Bounds } from "./config.js";

export function inRegion(bounds: Bounds, latitude: number, longitude: number): boolean {
  return (
    latitude >= bounds.minLat &&
    latitude <= bounds.maxLat &&
    longitude >= bounds.minLon &&
    longitude <= bounds.maxLon
  );
}
