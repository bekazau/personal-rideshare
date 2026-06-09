"use client";

import { useEffect, useState } from "react";

type Hint = "ios-chrome" | "ios-safari" | "android" | null;

export function InstallHint() {
  const [hint, setHint] = useState<Hint>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    // Non-Safari browsers on iOS use these UA tokens. They all share WebKit
    // but can't install PWAs to the home screen — iOS reserves that for Safari.
    const isNonSafariIOS = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(ua);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    let next: Hint = null;
    if (isStandalone) next = null; // already installed — nothing to say
    else if (isIOS && isNonSafariIOS) next = "ios-chrome";
    else if (isIOS) next = "ios-safari";
    else if (/Android/.test(ua)) next = "android";

    // Browser detection is inherently client-only; the initial null state
    // matches SSR, then we set the hint after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next) setHint(next);
  }, []);

  if (!hint) return null;

  if (hint === "ios-chrome") {
    return (
      <div className="rounded-2xl bg-amber-950/40 border border-amber-900/60 p-4 text-left space-y-2">
        <p className="font-medium text-amber-200">⚠️ Open this page in Safari</p>
        <p className="text-sm text-amber-100/80 leading-relaxed">
          You&apos;re using another browser. iPhone only lets <span className="font-medium">Safari</span> install
          web apps to the home screen — and you&apos;ll need that for ride notifications.
        </p>
        <p className="text-sm text-amber-100/80 leading-relaxed">
          Tap the <span className="font-mono">⋯</span> or share menu in your current browser and choose
          <span className="font-medium"> &ldquo;Open in Safari&rdquo;</span>, then come back to this page.
        </p>
      </div>
    );
  }

  if (hint === "ios-safari") {
    return (
      <div className="rounded-2xl bg-emerald-950/30 border border-emerald-900/60 p-4 text-left space-y-3">
        <p className="font-medium text-emerald-200">
          Add this to your home screen
        </p>
        <p className="text-sm text-emerald-100/80 leading-relaxed">
          Then you&apos;ll get a real app icon and a push notification when your driver replies
          — instead of having to find this page in Safari every time.
        </p>
        <ol className="text-sm text-emerald-100/90 space-y-1.5 pl-1">
          <li>
            <span className="font-medium">1.</span> Tap the Share button{" "}
            <ShareGlyph /> at the bottom of Safari
          </li>
          <li>
            <span className="font-medium">2.</span> Scroll and tap{" "}
            <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span>
          </li>
          <li>
            <span className="font-medium">3.</span> Tap <span className="font-medium">Add</span> in the top-right
          </li>
        </ol>
      </div>
    );
  }

  if (hint === "android") {
    return (
      <div className="rounded-2xl bg-emerald-950/30 border border-emerald-900/60 p-4 text-left space-y-2">
        <p className="font-medium text-emerald-200">Install this app</p>
        <p className="text-sm text-emerald-100/80 leading-relaxed">
          In Chrome, tap the <span className="font-mono">⋮</span> menu and choose{" "}
          <span className="font-medium">&ldquo;Install app&rdquo;</span> — you&apos;ll get a real
          icon and push notifications.
        </p>
      </div>
    );
  }

  return null;
}

// Approximate iOS share icon — square with an up arrow.
function ShareGlyph() {
  return (
    <svg
      width="14"
      height="16"
      viewBox="0 0 16 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-text-bottom"
    >
      <path d="M8 2v10" />
      <path d="M4.5 5.5L8 2l3.5 3.5" />
      <path d="M3 9v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />
    </svg>
  );
}
