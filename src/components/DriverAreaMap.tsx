"use client";

import { useState, useSyncExternalStore } from "react";

import { staleness } from "@/lib/geo";

// Returns false during SSR / first render, true once on the client — without a
// setState-in-effect (which the react-hooks lint rule forbids). Used to render
// the map tile client-only so its onError handler is attached before the image
// request fires.
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface Props {
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  areaName: string | null;
  driverName: string;
}

export function DriverAreaMap({
  lat,
  lng,
  lastSeenAt,
  areaName,
  driverName,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  // The rider page is force-dynamic, so a server-rendered <img> begins loading
  // before React hydrates — if it errors in that window, onError never fires
  // and a broken-image square persists. Rendering the tile client-only
  // guarantees onError is attached before the request, so a real failure
  // degrades to the text fallback.
  const mounted = useMounted();

  // Text-only fallback, shared by the no-data path and the image-error path.
  const textFallback = areaName ? (
    <p className="text-xs text-neutral-400">
      Last seen near {areaName} · {staleness(lastSeenAt)}
    </p>
  ) : null;

  // Fallbacks: no coords, not yet mounted, or the tile failed to load.
  if (lat == null || lng == null || !mounted || imgFailed) {
    return textFallback;
  }

  // Same-origin proxy (see /api/area-map). Keeps the Mapbox token server-side
  // and avoids cross-origin requests to api.mapbox.com that content blockers
  // routinely block.
  const url = `/api/area-map?lat=${encodeURIComponent(
    lat
  )}&lng=${encodeURIComponent(lng)}`;

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
