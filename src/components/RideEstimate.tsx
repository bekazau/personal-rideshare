"use client";

import { useEffect, useState } from "react";
import { getRideEstimate, type RideEstimateResult } from "@/app/actions/ride";
import { getBrowserPosition } from "@/lib/geo";

function fmtDuration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtDistance(meters: number): string {
  const mi = meters / 1609.34;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

// Shows driving estimates for a ride: trip time/distance (pickup→dropoff) and,
// when `withPickupEta` is set, the driver's ETA from their current location to
// the pickup. Renders nothing until the estimate resolves (or if it fails).
export function RideEstimate({
  rideId,
  withPickupEta = false,
}: {
  rideId: string;
  withPickupEta?: boolean;
}) {
  const [data, setData] = useState<RideEstimateResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let lat: number | undefined;
      let lng: number | undefined;
      if (withPickupEta) {
        try {
          const pos = await getBrowserPosition();
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // no location — fall back to trip-only
        }
      }
      const res = await getRideEstimate(rideId, lat, lng);
      if (!cancelled && "ok" in res) setData(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId, withPickupEta]);

  if (!data || (!data.trip && !data.pickup)) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
      {data.pickup && (
        <span>
          🚗 To pickup ~{fmtDuration(data.pickup.durationSec)} ·{" "}
          {fmtDistance(data.pickup.distanceM)}
        </span>
      )}
      {data.trip && (
        <span>
          🛣️ Trip ~{fmtDuration(data.trip.durationSec)} ·{" "}
          {fmtDistance(data.trip.distanceM)}
        </span>
      )}
    </div>
  );
}
