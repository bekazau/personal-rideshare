"use client";

import { useState } from "react";

import { useMounted } from "@/lib/use-mounted";

// Pickup→dropoff route image for a ride, served by the same-origin
// /api/route-map proxy. Rendered client-only (useMounted) so a failed load
// degrades to nothing instead of a broken-image icon. Hidden entirely if the
// image errors (e.g. the ride has no resolved coordinates).
export function RouteMap({ rideId, label }: { rideId: string; label: string }) {
  const mounted = useMounted();
  const [failed, setFailed] = useState(false);

  if (!mounted || failed) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-neutral-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/route-map?rideId=${encodeURIComponent(rideId)}`}
        alt={`Route map for ${label}`}
        className="w-full h-auto block"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
