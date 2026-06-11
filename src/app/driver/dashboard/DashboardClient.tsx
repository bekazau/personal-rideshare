"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  setDriverStatus,
  captureDriverLocation,
} from "@/app/actions/driver";
import {
  updateRideStatus,
  markRidePaid,
  sendQuote,
} from "@/app/actions/ride";
import { getBrowserPosition, staleness } from "@/lib/geo";
import { formatUsd } from "@/lib/fare";
import { paymentOptionsForDriver } from "@/lib/payments";
import { AppMenu } from "@/components/AppMenu";
import { RouteMap } from "@/components/RouteMap";
import type {
  DriverRow,
  DriverStatus,
  PaymentMethod,
  RideRow,
  RideStatus,
} from "@/lib/types/database";

interface Props {
  driver: DriverRow;
  initialRides: RideRow[];
}

const LIVE_GPS_INTERVAL_MS = 15_000;

export function DashboardClient({ driver: initialDriver, initialRides }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [driver, setDriver] = useState<DriverRow>(initialDriver);
  const [rides, setRides] = useState<RideRow[]>(initialRides);
  const [error, setError] = useState<string | null>(null);

  // ----- Realtime subscriptions ------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`driver-${driver.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rides",
          filter: `driver_id=eq.${driver.id}`,
        },
        (payload) => {
          const next = payload.new as RideRow | null;
          const old = payload.old as RideRow | null;
          if (payload.eventType === "DELETE" && old) {
            setRides((r) => r.filter((x) => x.id !== old.id));
            return;
          }
          if (!next) return;
          setRides((r) => {
            const existing = r.findIndex((x) => x.id === next.id);
            if (existing >= 0) {
              const copy = [...r];
              copy[existing] = next;
              return copy;
            }
            return [next, ...r];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "drivers",
          filter: `id=eq.${driver.id}`,
        },
        (payload) => {
          const next = payload.new as DriverRow;
          if (next) setDriver(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, driver.id]);

  // ----- Foreground GPS capture loop -------------------------------------------
  useEffect(() => {
    if (driver.status === "offline") return;

    let cancelled = false;
    const tick = async () => {
      try {
        const pos = await getBrowserPosition();
        if (cancelled) return;
        await captureDriverLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      } catch {
        // Silently ignore — user may have denied location, browser may have throttled.
      }
    };

    tick();
    const interval = setInterval(tick, LIVE_GPS_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [driver.status]);

  // ----- Actions ----------------------------------------------------------------
  const [pending, startTransition] = useTransition();

  async function changeStatus(status: DriverStatus) {
    setError(null);
    // Optimistic update — Realtime confirmation will repaint with server truth.
    const previous = driver.status;
    setDriver((d) => ({ ...d, status }));
    startTransition(async () => {
      const r = await setDriverStatus(status);
      if (r.error) {
        setError(r.error);
        setDriver((d) => ({ ...d, status: previous }));
      }
    });
  }

  async function transitionRide(rideId: string, next: RideStatus) {
    setError(null);
    startTransition(async () => {
      const r = await updateRideStatus(rideId, next);
      if (r.error) setError(r.error);
    });
  }

  async function quoteRide(rideId: string, amountCents: number) {
    setError(null);
    startTransition(async () => {
      const r = await sendQuote(rideId, amountCents);
      if (r.error) setError(r.error);
    });
  }

  async function recordPayment(rideId: string, method: PaymentMethod) {
    setError(null);
    startTransition(async () => {
      const r = await markRidePaid(rideId, method);
      if (r.error) setError(r.error);
    });
  }

  const activeRide = rides.find((r) =>
    ["accepted", "en_route", "arrived", "in_progress"].includes(r.status)
  );
  const pendingRides = rides.filter((r) => r.status === "pending");
  const quotedRides = rides.filter((r) => r.status === "quoted");
  const recentlyCompleted = rides.filter(
    (r) => r.status === "completed" && !r.paid_at
  );

  return (
    <main className="flex-1 px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-6">
      <header className="flex items-start gap-3">
        <AppMenu />
        <div className="space-y-1 flex-1">
          <p className="text-xs text-neutral-500 uppercase tracking-wider">Driver</p>
          <h1 className="text-2xl font-semibold">{driver.display_name}</h1>
        </div>
      </header>

      <StatusCard driver={driver} pending={pending} onChange={changeStatus} />

      {pendingRides.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">New requests</h2>
          {pendingRides.map((ride) => (
            <PendingRideCard
              key={ride.id}
              ride={ride}
              pending={pending}
              suggestedCents={driver.base_fare_cents}
              onQuote={(cents) => quoteRide(ride.id, cents)}
              onDecline={() => transitionRide(ride.id, "declined")}
            />
          ))}
        </section>
      )}

      {quotedRides.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">
            Waiting for confirmation
          </h2>
          {quotedRides.map((ride) => (
            <QuotedRideCard
              key={ride.id}
              ride={ride}
              onCancel={() => transitionRide(ride.id, "cancelled")}
            />
          ))}
        </section>
      )}

      {activeRide && (
        <ActiveRideCard
          ride={activeRide}
          onAdvance={(next) => transitionRide(activeRide.id, next)}
        />
      )}

      {recentlyCompleted.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">Awaiting payment</h2>
          {recentlyCompleted.map((ride) => (
            <PaymentRow
              key={ride.id}
              ride={ride}
              driver={driver}
              onMarkPaid={(method) => recordPayment(ride.id, method)}
            />
          ))}
        </section>
      )}

      {error && (
        <p className="text-sm text-rose-400 text-center">{error}</p>
      )}
    </main>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatusCard({
  driver,
  pending,
  onChange,
}: {
  driver: DriverRow;
  pending: boolean;
  onChange: (s: DriverStatus) => void;
}) {
  const dotColor: Record<DriverStatus, string> = {
    available: "bg-emerald-500",
    busy: "bg-amber-500",
    offline: "bg-neutral-600",
  };

  return (
    <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${dotColor[driver.status]}`} />
        <span className="font-medium capitalize">{driver.status}</span>
        {driver.last_area_name && (
          <span className="text-xs text-neutral-500 ml-auto">
            Last seen near {driver.last_area_name} · {staleness(driver.last_location_at)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatusButton current={driver.status} value="available" onClick={onChange} disabled={pending}>
          Available
        </StatusButton>
        <StatusButton current={driver.status} value="busy" onClick={onChange} disabled={pending}>
          Busy
        </StatusButton>
        <StatusButton current={driver.status} value="offline" onClick={onChange} disabled={pending}>
          Offline
        </StatusButton>
      </div>
    </section>
  );
}

function StatusButton({
  current,
  value,
  onClick,
  disabled,
  children,
}: {
  current: DriverStatus;
  value: DriverStatus;
  onClick: (v: DriverStatus) => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const isActive = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      disabled={disabled || isActive}
      className={`rounded-xl py-2 text-sm font-medium transition ${
        isActive
          ? "bg-white text-neutral-950"
          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
      } disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function formatSchedule(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SchedBadge({ iso }: { iso: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-semibold px-2 py-0.5">
      ⏰ FOR LATER · {formatSchedule(iso)}
    </span>
  );
}

function PendingRideCard({
  ride,
  pending,
  suggestedCents,
  onQuote,
  onDecline,
}: {
  ride: RideRow;
  pending: boolean;
  suggestedCents: number;
  onQuote: (cents: number) => void;
  onDecline: () => void;
}) {
  const [price, setPrice] = useState(
    suggestedCents > 0 ? (suggestedCents / 100).toFixed(2) : ""
  );
  const cents = Math.round(Number(price || "0") * 100);
  const valid = Number.isFinite(cents) && cents > 0;

  // Scheduled requests get a loud amber border so they're unmistakable.
  const scheduled = !!ride.scheduled_for;

  return (
    <div
      className={`rounded-2xl bg-neutral-900 p-4 space-y-3 border ${
        scheduled ? "border-amber-500/60" : "border-amber-900/40"
      }`}
    >
      {scheduled && ride.scheduled_for && (
        <div>
          <SchedBadge iso={ride.scheduled_for} />
        </div>
      )}
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1">
          <p className="font-medium">{ride.pickup_address}</p>
          {ride.dropoff_address && (
            <p className="text-sm text-neutral-400">→ {ride.dropoff_address}</p>
          )}
          {ride.rider_notes && (
            <p className="text-xs text-neutral-500 italic">&ldquo;{ride.rider_notes}&rdquo;</p>
          )}
        </div>
        {ride.is_first_ride && (
          <span className="text-xs text-emerald-400 shrink-0">First ride</span>
        )}
      </div>

      {ride.pickup_lat != null && ride.dropoff_lat != null && (
        <RouteMap rideId={ride.id} label={ride.pickup_address} />
      )}

      <div className="space-y-1">
        <label className="text-xs text-neutral-400">Your price for this ride</label>
        <div className="flex items-center gap-2 rounded-xl bg-neutral-800 px-3">
          <span className="text-neutral-400">$</span>
          <input
            type="number"
            min="0"
            step="0.50"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent py-2 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onDecline}
          disabled={pending}
          className="rounded-xl bg-neutral-800 text-neutral-300 py-2 font-medium hover:bg-neutral-700 disabled:opacity-50"
        >
          Decline
        </button>
        <button
          onClick={() => onQuote(cents)}
          disabled={pending || !valid}
          className="rounded-xl bg-emerald-500 text-neutral-950 py-2 font-medium hover:bg-emerald-400 disabled:opacity-50"
        >
          Send quote
        </button>
      </div>
    </div>
  );
}

function QuotedRideCard({
  ride,
  onCancel,
}: {
  ride: RideRow;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-sky-900/50 p-4 space-y-2">
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1">
          <p className="font-medium">{ride.pickup_address}</p>
          {ride.dropoff_address && (
            <p className="text-sm text-neutral-400">→ {ride.dropoff_address}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold">{formatUsd(ride.base_fare_cents)}</p>
          <p className="text-xs text-sky-400">Quote sent</p>
        </div>
      </div>
      {ride.scheduled_for && <SchedBadge iso={ride.scheduled_for} />}
      <p className="text-xs text-neutral-500">Waiting for the rider to confirm…</p>
      <button
        onClick={onCancel}
        className="w-full text-xs text-neutral-500 underline"
      >
        Cancel this request
      </button>
    </div>
  );
}

const NEXT_LABEL: Partial<Record<RideStatus, { label: string; next: RideStatus }>> = {
  accepted: { label: "I'm on the way", next: "en_route" },
  en_route: { label: "Arrived at pickup", next: "arrived" },
  arrived: { label: "Start ride", next: "in_progress" },
  in_progress: { label: "Complete ride", next: "completed" },
};

function ActiveRideCard({
  ride,
  onAdvance,
}: {
  ride: RideRow;
  onAdvance: (next: RideStatus) => void;
}) {
  const cta = NEXT_LABEL[ride.status as RideStatus];
  // Pre-pickup phases get a navigate-to-pickup link. Once in_progress, that's
  // irrelevant — they're already with the rider.
  const showNavToPickup = ["accepted", "en_route", "arrived"].includes(ride.status);
  const showNavToDropoff = ride.status === "in_progress" && !!ride.dropoff_address;
  return (
    <section className="rounded-2xl bg-neutral-900 border border-emerald-900/40 p-4 space-y-3">
      {ride.scheduled_for && (
        <div>
          <SchedBadge iso={ride.scheduled_for} />
        </div>
      )}
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-emerald-400">
            {ride.status.replace("_", " ")}
          </p>
          <p className="font-medium">{ride.pickup_address}</p>
          {ride.dropoff_address && (
            <p className="text-sm text-neutral-400">→ {ride.dropoff_address}</p>
          )}
        </div>
        <p className="font-semibold">{formatUsd(ride.total_cents)}</p>
      </div>
      {ride.pickup_lat != null && ride.dropoff_lat != null && (
        <RouteMap rideId={ride.id} label={ride.pickup_address} />
      )}
      {showNavToPickup && (
        <NavigateButton
          label="Navigate to pickup"
          lat={ride.pickup_lat}
          lng={ride.pickup_lng}
          address={ride.pickup_address}
        />
      )}
      {showNavToDropoff && (
        <NavigateButton
          label="Navigate to dropoff"
          lat={ride.dropoff_lat}
          lng={ride.dropoff_lng}
          address={ride.dropoff_address}
        />
      )}
      {cta && (
        <button
          onClick={() => onAdvance(cta.next)}
          className="w-full rounded-xl bg-white text-neutral-950 py-3 font-medium hover:bg-neutral-200"
        >
          {cta.label}
        </button>
      )}
      <button
        onClick={() => onAdvance("cancelled")}
        className="w-full text-xs text-neutral-500 underline"
      >
        Cancel this ride
      </button>
    </section>
  );
}

function NavigateButton({
  label,
  lat,
  lng,
  address,
}: {
  label: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}) {
  // Prefer coordinates (always unambiguous); fall back to the typed address.
  const destination = lat != null && lng != null ? `${lat},${lng}` : address;
  if (!destination) return null;

  // Apple Maps deep-link works native on iOS, falls back to the web on
  // everywhere else. dirflg=d = driving.
  const url = `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full rounded-xl bg-sky-500 text-neutral-950 py-3 font-medium text-center hover:bg-sky-400 flex items-center justify-center gap-2"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l19-9-9 19-2-8-8-2z" />
      </svg>
      {label}
    </a>
  );
}

function PaymentRow({
  ride,
  driver,
  onMarkPaid,
}: {
  ride: RideRow;
  driver: DriverRow;
  onMarkPaid: (method: PaymentMethod) => void;
}) {
  const options = paymentOptionsForDriver(driver, ride.total_cents);
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="font-medium">{ride.pickup_address}</p>
          <p className="text-xs text-neutral-500">Awaiting payment</p>
        </div>
        <p className="font-semibold">{formatUsd(ride.total_cents)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onMarkPaid(opt.id)}
            className="rounded-lg bg-neutral-800 text-xs px-3 py-1.5 hover:bg-neutral-700"
          >
            Paid via {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

