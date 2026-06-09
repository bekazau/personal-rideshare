"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AppMenu } from "@/components/AppMenu";

export interface RiderEntry {
  id: string;
  display_name: string;
  last_seen_at: string | null;
  invited_at: string;
}

const ONLINE_WINDOW_MS = 90_000;

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const ts = Date.parse(lastSeenAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ONLINE_WINDOW_MS;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs)) return "never";
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function RidersList({ initial }: { initial: RiderEntry[] }) {
  const [riders, setRiders] = useState<RiderEntry[]>(initial);
  // Tick periodically so the relative timestamps refresh in the UI even
  // between fetches.
  const [, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("driver_rider_links")
      .select("invited_at, riders(id, display_name, last_seen_at)")
      .order("invited_at", { ascending: false });

    if (!data) return;
    type RiderJoin = { id: string; display_name: string; last_seen_at: string | null };
    type LinkJoin = { invited_at: string; riders: RiderJoin | RiderJoin[] | null };
    const next: RiderEntry[] = data
      .map((row) => {
        const linkRow = row as unknown as LinkJoin;
        const r = linkRow.riders;
        const rider = Array.isArray(r) ? r[0] : r;
        if (!rider) return null;
        return {
          id: rider.id,
          display_name: rider.display_name,
          last_seen_at: rider.last_seen_at,
          invited_at: linkRow.invited_at,
        };
      })
      .filter((x): x is RiderEntry => x !== null);
    setRiders(next);
  }, []);

  useEffect(() => {
    const poll = setInterval(refresh, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const onlineCount = riders.filter((r) => isOnline(r.last_seen_at)).length;

  return (
    <main className="flex-1 flex flex-col px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-4">
      <header className="flex items-start gap-3">
        <AppMenu />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Riders</h1>
        </div>
      </header>

      <p className="text-xs text-neutral-500">
        {riders.length === 0
          ? "No riders yet — share your invite link from the dashboard."
          : `${riders.length} rider${riders.length === 1 ? "" : "s"}${
              onlineCount > 0 ? ` · ${onlineCount} online now` : ""
            }`}
      </p>

      <ul className="space-y-2">
        {riders.map((r) => {
          const online = isOnline(r.last_seen_at);
          return (
            <li key={r.id}>
              <Link
                href={`/driver/riders/${r.id}`}
                className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 flex items-center gap-3 hover:bg-neutral-800/70 transition"
              >
                <span
                  aria-label={online ? "Online" : "Offline"}
                  className={`h-3 w-3 rounded-full shrink-0 ${
                    online ? "bg-emerald-500" : "bg-neutral-600"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.display_name}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {online ? "Online now" : `Last seen ${relativeTime(r.last_seen_at)}`}
                  </p>
                </div>
                <span className="text-neutral-500 shrink-0">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
