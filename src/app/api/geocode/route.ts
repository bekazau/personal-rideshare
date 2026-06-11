import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Address / business / POI autocomplete for the ride request form, backed by
// the Mapbox Search Box API (which — unlike the Geocoding API — can find
// businesses and institutions by name, e.g. "Grady High School"). Keeps the
// token server-side; gated to signed-in users to protect the quota.
//
// This is the "suggest" half. Suggestions carry a `mapbox_id` but no
// coordinates; the client calls /api/geocode/retrieve when one is picked.
//
// GET /api/geocode?q=<text>&session=<uuid>&proximity=<lng>,<lat>
//   -> { suggestions: [{ mapbox_id, name, place_formatted }] }

export interface SuggestItem {
  mapbox_id: string;
  name: string;
  place_formatted: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const session = searchParams.get("session") ?? "";
  const proximity = searchParams.get("proximity"); // "lng,lat"

  if (q.length < 3 || !session) return Response.json({ suggestions: [] });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ suggestions: [] });

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return Response.json({ suggestions: [] });

  let url =
    `https://api.mapbox.com/search/searchbox/v1/suggest` +
    `?q=${encodeURIComponent(q)}` +
    `&access_token=${encodeURIComponent(token)}` +
    `&session_token=${encodeURIComponent(session)}` +
    `&limit=6&language=en` +
    `&types=poi,address,street,place,neighborhood,locality`;
  if (proximity && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(proximity)) {
    url += `&proximity=${proximity}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return Response.json({ suggestions: [] });
    const data = (await res.json()) as {
      suggestions?: {
        mapbox_id?: string;
        name?: string;
        place_formatted?: string;
        full_address?: string;
      }[];
    };
    const suggestions: SuggestItem[] = (data.suggestions ?? [])
      .filter((s) => s.mapbox_id && s.name)
      .map((s) => ({
        mapbox_id: s.mapbox_id!,
        name: s.name!,
        place_formatted: s.place_formatted ?? s.full_address ?? null,
      }));
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
