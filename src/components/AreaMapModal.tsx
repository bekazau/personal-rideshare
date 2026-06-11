"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

import { staleness } from "@/lib/geo";

interface Props {
  lat: number;
  lng: number;
  areaName: string | null;
  lastSeenAt: string | null;
  onClose: () => void;
}

// Fullscreen interactive map for the driver's "general area". Leaflet is loaded
// here (and this whole module is dynamically imported with ssr:false by
// DriverAreaMap) so it stays out of the main bundle and never runs on the
// server. Tiles come from the same-origin /api/map-tiles proxy.
const AREA_RADIUS_M = 800; // the fuzzy "somewhere in here" circle
const INITIAL_ZOOM = 13;
// No zoom-out cap — riders can pull back to the whole world. (1 is the floor
// because the 512px tiles use zoomOffset -1, so Leaflet zoom 1 = tile z0.)
const MIN_ZOOM = 1;
// Privacy cap: keep the view at neighborhood scale so the exact center (the
// driver's real point) can't be read down to a building. Mirrors MAX_TILE_Z in
// the proxy (Leaflet zoom = tile z + 1 with zoomOffset -1, so 15 -> tile z14).
const MAX_ZOOM = 15;

export function AreaMapModal({ lat, lng, areaName, lastSeenAt, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Build the Leaflet map imperatively against the container ref, and tear it
  // down on unmount. (Effects are the right place for this kind of external-
  // system setup; no React state is involved.)
  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: INITIAL_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        zoomControl: false, // re-added bottom-left, clear of the iPhone notch
        attributionControl: true,
      });
      L.control.zoom({ position: "bottomleft" }).addTo(map);

      L.tileLayer("/api/map-tiles/{z}/{x}/{y}", {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        attribution:
          '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // The "general area" circle — a real geographic radius, so it keeps
      // covering the same ground at every zoom (no exact pin).
      L.circle([lat, lng], {
        radius: AREA_RADIUS_M,
        color: "#10b981",
        weight: 2,
        fillColor: "#10b981",
        fillOpacity: 0.15,
      }).addTo(map);

      // Leaflet can mis-measure the container if it mounts mid-animation.
      map.whenReady(() => map?.invalidateSize());
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950">
      {/* Map fills the screen */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Close button — offset below the iPhone notch / status bar */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close map"
        style={{
          top: "calc(env(safe-area-inset-top) + 0.75rem)",
          right: "calc(env(safe-area-inset-right) + 0.75rem)",
        }}
        className="absolute z-[1000] h-11 w-11 rounded-full bg-neutral-950/80 text-neutral-100 text-xl leading-none backdrop-blur-sm border border-neutral-700 flex items-center justify-center"
      >
        ✕
      </button>

      {/* Caption — kept above the iPhone home indicator */}
      <div
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        className="absolute left-4 right-4 z-[1000] flex justify-center pointer-events-none"
      >
        <div className="rounded-lg bg-neutral-950/80 backdrop-blur-sm px-3 py-1.5">
          <p className="text-xs text-neutral-200">
            {areaName ? (
              <>
                General area near <span className="font-medium">{areaName}</span> ·{" "}
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
