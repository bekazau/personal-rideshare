"use client";

import { useState } from "react";

import { staleness } from "@/lib/geo";

interface Props {
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  areaName: string | null;
  driverName: string;
}

// Mapbox Static Images API params. Public dark style; 600x240 @2x is a good
// retina-crisp banner. Zoom 13 ≈ neighborhood scale (the fuzzy circle
// overlay implies "somewhere in this area", not an exact point).
const MAP_W = 600;
const MAP_H = 240;
const ZOOM = 13;

export function DriverAreaMap({
  lat,
  lng,
  lastSeenAt,
  areaName,
  driverName,
}: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [imgFailed, setImgFailed] = useState(false);

  // Text-only fallback, shared by the no-data path and the image-error path.
  const textFallback = areaName ? (
    <p className="text-xs text-neutral-400">
      Last seen near {areaName} · {staleness(lastSeenAt)}
    </p>
  ) : null;

  // Fallbacks: if we have no coords or no token, or the static tile failed to
  // load (e.g. Mapbox 403/rate-limit/offline), fall back to text only.
  if (lat == null || lng == null || !token || imgFailed) {
    return textFallback;
  }

  const url =
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/` +
    `${lng},${lat},${ZOOM},0/${MAP_W}x${MAP_H}@2x` +
    `?access_token=${encodeURIComponent(token)}` +
    `&attribution=false&logo=false`;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-neutral-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${driverName}'s last-known area`}
        className="w-full h-auto block"
        loading="lazy"
        onError={() => setImgFailed(true)}
      />

      {/* Fuzzy "general area" circle anchored at map center (= driver point). */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-32 w-32 rounded-full bg-emerald-500/15 border-2 border-emerald-500/60" />
      </div>

      {/* Caption — area name + relative time */}
      <div className="absolute bottom-2 left-2 right-2">
        <div className="rounded-lg bg-neutral-950/75 backdrop-blur-sm px-3 py-1.5 inline-block">
          <p className="text-xs text-neutral-200">
            {areaName ? (
              <>
                Near <span className="font-medium">{areaName}</span> ·{" "}
                {staleness(lastSeenAt)}
              </>
            ) : (
              <>Last seen {staleness(lastSeenAt)}</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
