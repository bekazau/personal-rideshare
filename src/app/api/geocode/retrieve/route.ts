import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Retrieve" half of the Search Box autocomplete: turns a suggestion's
// mapbox_id (from /api/geocode) into coordinates. Same session token as the
// suggest call so Mapbox bills them as one search session.
//
// GET /api/geocode/retrieve?id=<mapbox_id>&session=<uuid>
//   -> { lat, lng, name } | { error }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  const session = searchParams.get("session") ?? "";
  if (!id || !session) return Response.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return Response.json({ error: "Not configured" }, { status: 502 });

  const url =
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(id)}` +
    `?access_token=${encodeURIComponent(token)}&session_token=${encodeURIComponent(session)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return Response.json({ error: "Lookup failed" }, { status: 502 });
    const data = (await res.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string };
      }[];
    };
    const feat = data.features?.[0];
    const coords = feat?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      return Response.json({ error: "No coordinates" }, { status: 404 });
    }
    return Response.json({
      lng: coords[0],
      lat: coords[1],
      name: feat?.properties?.name ?? null,
    });
  } catch {
    return Response.json({ error: "Lookup failed" }, { status: 502 });
  }
}
