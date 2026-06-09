"use client";

import { useEffect, useState } from "react";

// Brief launch splash: black background + favicon, fades after ~900ms.
// Rendered once at root layout mount, so it shows on cold-load / PWA launch
// but doesn't reappear on client-side navigations (layout persists).
export function Splash() {
  const [phase, setPhase] = useState<"showing" | "fading" | "hidden">("showing");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fading"), 900);
    const t2 = setTimeout(() => setPhase("hidden"), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] bg-black flex items-center justify-center pointer-events-none transition-opacity duration-500 ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/web-app-manifest-192x192.png"
        alt=""
        width={120}
        height={120}
        className="select-none"
      />
    </div>
  );
}
