import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Same-origin proxy that renders a pickup→dropoff route map for a ride, shown
// on the driver's request card. Like /api/area-map it keeps the Mapbox token
// server-side and avoids cross-origin requests the browser might block.
//
// Auth: the ride is read with the caller's session, so Supabase RLS only
// returns it to that ride's driver or rider. Anyone else gets 404.

const IMG_W = 600;
const IMG_H = 300;

export async function GET(req: NextRequest) {
  const rideId = new URL(req.url).searchParams.get("rideId");
  if (!rideId) return new Response("Missing rideId", { status: 400 });

  const supabase = await createClient();
  const { data: ride } = await supabase
    .from("rides")
    .select("pickup_lat, pickup_lng, dropoff_lat, dropoff_lng")
    .eq("id", rideId)
    .maybeSingle();

  if (!ride) return new Response("Not found", { status: 404 });

  const { pickup_lat: plat, pickup_lng: plng, dropoff_lat: dlat, dropoff_lng: dlng } =
    ride;
  if (plat == null || plng == null || dlat == null || dlng == null) {
    return new Response("No route for this ride", { status: 404 });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return new Response("Map not configured", { status: 502 });

  // Get the road route geometry from the Directions API. Best-effort — if it
  // fails we still render the two pins, auto-fit, without a line.
  let pathOverlay: string | null = null;
  try {
    const dirUrl =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${plng},${plat};${dlng},${dlat}` +
      `?geometries=polyline&overview=full&access_token=${encodeURIComponent(token)}`;
    const dirRes = await fetch(dirUrl);
    if (dirRes.ok) {
      const dir = (await dirRes.json()) as { routes?: { geometry?: string }[] };
      const geometry = dir.routes?.[0]?.geometry;
      if (geometry) {
        pathOverlay = `path-5+3b82f6-0.85(${encodeURIComponent(geometry)})`;
      }
    }
  } catch {
    // ignore — fall through to pins-only
  }

  const pinPickup = `pin-s-a+10b981(${plng},${plat})`; // green A
  const pinDropoff = `pin-s-b+ef4444(${dlng},${dlat})`; // red B
  const overlays = [pathOverlay, pinPickup, pinDropoff].filter(Boolean).join(",");

  // Fully server-constructed; only validated numeric coords + Mapbox's own
  // geometry are interpolated.
  const staticUrl =
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlays}/auto/` +
    `${IMG_W}x${IMG_H}@2x?access_token=${encodeURIComponent(token)}` +
    `&attribution=false&logo=false&padding=40`;

  let res: Response;
  try {
    res = await fetch(staticUrl);
  } catch {
    return new Response("Map upstream unreachable", { status: 502 });
  }
  if (!res.ok || !res.body) {
    return new Response("Map upstream error", { status: 502 });
  }

  // The route for a given ride doesn't change; cache per-user for a while.
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "private, max-age=600",
    },
  });
}
