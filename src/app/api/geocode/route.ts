import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Address autocomplete proxy for the ride request form. Keeps the Mapbox token
// server-side; gated to signed-in users so it can't be used to burn the
// geocoding quota anonymously.
//
// GET /api/geocode?q=<text>&proximity=<lng>,<lat>
//   -> { suggestions: [{ name, lat, lng }] }

export interface AddressSuggestion {
  name: string;
  lat: number;
  lng: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const proximity = searchParams.get("proximity"); // "lng,lat"

  // Short queries aren't worth a round-trip.
  if (q.length < 3) return Response.json({ suggestions: [] });

  // Only for signed-in users.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ suggestions: [] });

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return Response.json({ suggestions: [] });

  let url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?autocomplete=true&limit=5&types=address,place,poi,locality,neighborhood` +
    `&access_token=${encodeURIComponent(token)}`;
  if (proximity && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(proximity)) {
    url += `&proximity=${proximity}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return Response.json({ suggestions: [] });
    const data = (await res.json()) as {
      features?: { place_name?: string; center?: [number, number] }[];
    };
    const suggestions: AddressSuggestion[] = (data.features ?? [])
      .filter((f) => f.center && f.place_name)
      .map((f) => ({ name: f.place_name!, lat: f.center![1], lng: f.center![0] }));
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
