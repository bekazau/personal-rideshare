// Haversine distance, meters. Matches the SQL helper in 0001_init.sql.
export function metersBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function isInsideHomeZone(
  point: GeoPoint,
  home: { lat: number | null; lng: number | null; radiusMeters: number | null }
): boolean {
  if (home.lat == null || home.lng == null || home.radiusMeters == null) return false;
  return metersBetween(point.lat, point.lng, home.lat, home.lng) <= home.radiusMeters;
}

export function getBrowserPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 15_000,
      ...options,
    });
  });
}

// A single Mapbox geocoding feature (only the fields we read).
export interface GeocodeFeature {
  text?: string;
  // Parent contexts (place, region/state, country). For US results the region
  // entry carries a `short_code` like "US-CA".
  context?: { id?: string; short_code?: string; text?: string }[];
}

// Format a geocode feature as "City, ST" — e.g. "Santa Rosa, CA" — so a
// rider on a road trip can tell which state the area is in. Falls back to just
// the place name when no region is available (non-US, missing context, etc.).
export function formatGeocodeArea(feature: GeocodeFeature | undefined): string | null {
  const name = feature?.text;
  if (!name) return null;

  const region = feature?.context?.find((c) => c.id?.startsWith("region"));
  // "US-CA" -> "CA"; otherwise fall back to the full region name ("California").
  const state = region?.short_code?.split("-")[1]?.toUpperCase() ?? region?.text;

  return state ? `${name}, ${state}` : name;
}

// Reverse-geocode a lat/lng to a "City, ST" area name using Mapbox.
// Server-only — MAPBOX_ACCESS_TOKEN must not be exposed to the client.
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=neighborhood,locality,place&limit=1&access_token=${token}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: GeocodeFeature[] };
    return formatGeocodeArea(data.features?.[0]);
  } catch {
    return null;
  }
}

export function staleness(updatedAtIso: string | null): string {
  if (!updatedAtIso) return "never seen";
  const minutes = Math.floor((Date.now() - new Date(updatedAtIso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "~1 hr ago";
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
