import type { NextRequest } from "next/server";

// Same-origin proxy for Mapbox raster map tiles, used by the interactive
// fullscreen area map (Leaflet). Same rationale as /api/area-map: keep the
// Mapbox token server-side and avoid cross-origin requests to api.mapbox.com
// that content blockers routinely drop.
//
// Leaflet requests `/api/map-tiles/{z}/{x}/{y}`. We serve 512px @2x tiles from
// the dark-v11 style (the tile layer is configured with tileSize 512 /
// zoomOffset -1 to match).

// Privacy cap: the fullscreen map limits zoom so riders see a neighborhood,
// not an exact address. Reject tile requests above this zoom as defense in
// depth (z here is the Mapbox tile z = Leaflet zoom - 1, so Leaflet 15 -> 14).
const MAX_TILE_Z = 14;

function isTileIndex(value: string): boolean {
  return /^\d+$/.test(value);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await ctx.params;

  if (!isTileIndex(z) || !isTileIndex(x) || !isTileIndex(y)) {
    return new Response("Bad tile coordinates", { status: 400 });
  }
  const zoom = Number(z);
  if (zoom > MAX_TILE_Z) {
    return new Response("Zoom not allowed", { status: 403 });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return new Response("Map not configured", { status: 502 });
  }

  // Fully server-constructed URL — only numeric z/x/y are interpolated.
  const upstream =
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/512/` +
    `${zoom}/${x}/${y}@2x?access_token=${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetch(upstream);
  } catch {
    return new Response("Tile upstream unreachable", { status: 502 });
  }

  if (!res.ok || !res.body) {
    return new Response("Tile upstream error", { status: 502 });
  }

  // Tiles are effectively immutable for a given style/z/x/y — cache hard.
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
