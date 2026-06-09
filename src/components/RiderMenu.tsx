"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";

const DRAWER_WIDTH = 288;
const OPEN_THRESHOLD = 80;
const EDGE_ZONE = 25;

export function RiderMenu({ inviteCode }: { inviteCode: string }) {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const latestDxRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      if (!open && x > EDGE_ZONE) return;
      startXRef.current = x;
      startYRef.current = e.touches[0].clientY;
      draggingRef.current = true;
      latestDxRef.current = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        draggingRef.current = false;
        setDragX(null);
        return;
      }
      if (e.cancelable) e.preventDefault();
      const clamped = open
        ? Math.max(-DRAWER_WIDTH, Math.min(0, dx))
        : Math.max(0, Math.min(DRAWER_WIDTH, dx));
      latestDxRef.current = clamped;
      setDragX(clamped);
    };

    const onEnd = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const final = latestDxRef.current;
      setDragX(null);
      if (open) {
        if (final < -OPEN_THRESHOLD) setOpen(false);
      } else {
        if (final > OPEN_THRESHOLD) setOpen(true);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [open]);

  const isDragging = dragX !== null;
  const translateX = isDragging
    ? open
      ? (dragX as number)
      : -DRAWER_WIDTH + (dragX as number)
    : open
    ? 0
    : -DRAWER_WIDTH;
  const backdropOpacity = Math.max(
    0,
    Math.min(0.6, ((translateX + DRAWER_WIDTH) / DRAWER_WIDTH) * 0.6)
  );

  const base = `/ride/${inviteCode}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="p-2 -ml-2 rounded-lg text-neutral-200 hover:bg-neutral-800/60 active:bg-neutral-800"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 bg-black z-40"
        style={{
          opacity: backdropOpacity,
          pointerEvents: backdropOpacity > 0.05 ? "auto" : "none",
          transition: isDragging ? "none" : "opacity 0.25s ease-out",
        }}
        aria-hidden={!open}
      />

      <nav
        className="fixed inset-y-0 left-0 w-72 max-w-[80%] bg-neutral-950 border-r border-neutral-800 shadow-2xl z-50 flex flex-col pt-safe pb-safe"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? "none" : "transform 0.25s ease-out",
        }}
        aria-hidden={!open && !isDragging}
      >
        <div className="flex items-center justify-between px-5 pt-8 pb-6">
          <p className="text-xs text-neutral-500 uppercase tracking-wider">Menu</p>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="p-1.5 -mr-1.5 rounded-lg text-neutral-400 hover:bg-neutral-800/60"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <ul className="flex-1 px-2 space-y-1">
          <MenuLink href={base} onClick={() => setOpen(false)}>Home</MenuLink>
          <MenuLink href={`${base}/chat`} onClick={() => setOpen(false)}>Chat</MenuLink>
          <MenuLink href={`${base}/settings`} onClick={() => setOpen(false)}>Settings</MenuLink>
        </ul>

        <form action={signOut} className="px-2 pb-2">
          <button
            type="submit"
            className="w-full text-left px-3 py-3 rounded-xl text-sm text-rose-400 hover:bg-neutral-900"
          >
            Sign out
          </button>
        </form>
      </nav>
    </>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="block px-3 py-3 rounded-xl text-base text-neutral-100 hover:bg-neutral-900"
      >
        {children}
      </Link>
    </li>
  );
}
