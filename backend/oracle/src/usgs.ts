import type { QuakeInput } from "./types.js";

// The subset of a USGS GeoJSON feature the oracle reads.
// Same shape from the live summary feed and the FDSN event query.
export interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
  };
  geometry: { coordinates: [number, number, number] };
}

const FDSN_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const TIMEOUT_MS = 10_000;

// Returns null when a field the classifier requires is missing. The oracle never fills in
// a value (classifier contract §10); a live event skipped here is retried on the next poll.
export function toQuakeInput(f: UsgsFeature): QuakeInput | null {
  const p = f.properties;
  const [longitude, latitude, depthKm] = (f.geometry?.coordinates ?? []) as unknown[];
  const magnitude: unknown = p.mag;
  if (!isNumber(magnitude) || !isNumber(depthKm) || !isNumber(latitude) || !isNumber(longitude)) {
    return null;
  }
  return {
    usgsId: f.id,
    time: new Date(p.time).toISOString().replace(/\.\d{3}Z$/, "Z"),
    magnitude,
    depthKm,
    latitude,
    longitude,
    place: p.place ?? "Unknown location",
  };
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`USGS ${res.status} for ${url}`);
  return res.json();
}

// Live feed: every event USGS published in the feed's window.
export async function fetchFeed(feedUrl: string): Promise<QuakeInput[]> {
  const body = (await getJson(feedUrl)) as { features: UsgsFeature[] };
  return body.features.map(toQuakeInput).filter((q): q is QuakeInput => q !== null);
}

// One historical event by its USGS ID, for replay scenarios.
export async function fetchEventById(usgsId: string): Promise<QuakeInput> {
  const url = `${FDSN_QUERY}?format=geojson&eventid=${encodeURIComponent(usgsId)}`;
  const feature = (await getJson(url)) as UsgsFeature;
  const input = toQuakeInput(feature);
  if (!input) throw new Error(`USGS event ${usgsId} is missing magnitude, depth or location`);
  return input;
}
