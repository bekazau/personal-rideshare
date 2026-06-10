import type { NextRequest } from "next/server";

// Same-origin proxy for the driver's "last-known area" map tile.
//
// The rider app used to point an <img> straight at api.mapbox.com with a
// NEXT_PUBLIC_ token. That cross-origin request is routinely blocked by
// privacy/content blockers (Brave Shields, uBlock, etc.), which surfaced as a
// broken-image icon. Proxying the static tile through our own origin makes the
// request same-origin (unblockable by those tools) and keeps the Mapbox token
// server-side. See plan: rider-app area map fix.

// Static Images API params — must match the look the rider app expects.
// Public dark style; 600x240 @2x is a retina-crisp banner. Zoom 13 ≈
// neighborhood scale (a fuzzy circle overlay implies "somewhere in this area").
const MAP_W = 600;
const MAP_H = 240;
const ZOOM = 13;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return new Response("Invalid coordinates", { status: 400 });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return new Response("Map not configured", { status: 502 });
  }

  // Fully server-constructed URL — only numeric lat/lng are interpolated, so
  // there is no SSRF surface (the upstream host/path are fixed).
  const upstream =
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/` +
    `${lng},${lat},${ZOOM},0/${MAP_W}x${MAP_H}@2x` +
    `?access_token=${encodeURIComponent(token)}` +
    `&attribution=false&logo=false`;

  let res: Response;
  try {
    res = await fetch(upstream);
  } catch {
    return new Response("Map upstream unreachable", { status: 502 });
  }

  if (!res.ok || !res.body) {
    return new Response("Map upstream error", { status: 502 });
  }

  // Stream the PNG straight back. Short cache: the area updates as the driver
  // moves, but identical coords within a minute can be served from cache.
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}
