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
} from "@/app/actions/ride";
import { getBrowserPosition, staleness } from "@/lib/geo";
import { formatUsd } from "@/lib/fare";
import { paymentOptionsForDriver } from "@/lib/payments";
import { signOut } from "@/app/actions/auth";
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
    startTransition(async () => {
      const r = await setDriverStatus(status);
      if (r.error) setError(r.error);
    });
  }

  async function transitionRide(rideId: string, next: RideStatus) {
    setError(null);
    startTransition(async () => {
      const r = await updateRideStatus(rideId, next);
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
  const recentlyCompleted = rides.filter(
    (r) => r.status === "completed" && !r.paid_at
  );

  return (
    <main className="flex-1 px-6 py-6 max-w-md mx-auto w-full space-y-6 pb-24">
      <header className="space-y-1">
        <p className="text-xs text-neutral-500 uppercase tracking-wider">Driver</p>
        <h1 className="text-2xl font-semibold">{driver.display_name}</h1>
      </header>

      <StatusCard driver={driver} pending={pending} onChange={changeStatus} />

      {pendingRides.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">New requests</h2>
          {pendingRides.map((ride) => (
            <PendingRideCard
              key={ride.id}
              ride={ride}
              onAccept={() => transitionRide(ride.id, "accepted")}
              onDecline={() => transitionRide(ride.id, "declined")}
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

      <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
        <p className="text-xs text-neutral-400 uppercase tracking-wider">Your invite link</p>
        <p className="text-sm font-mono break-all">
          {typeof window !== "undefined" ? window.location.origin : ""}/ride/{driver.invite_code}
        </p>
      </section>

      {error && (
        <p className="text-sm text-rose-400 text-center">{error}</p>
      )}

      <form action={signOut}>
        <button className="text-xs text-neutral-500 underline w-full">Sign out</button>
      </form>
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

function PendingRideCard({
  ride,
  onAccept,
  onDecline,
}: {
  ride: RideRow;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-amber-900/40 p-4 space-y-3">
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
        <div className="text-right">
          <p className="font-semibold">{formatUsd(ride.total_cents)}</p>
          {ride.is_first_ride && ride.discount_cents > 0 && (
            <p className="text-xs text-emerald-400">First ride discount</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onDecline}
          className="rounded-xl bg-neutral-800 text-neutral-300 py-2 font-medium hover:bg-neutral-700"
        >
          Decline
        </button>
        <button
          onClick={onAccept}
          className="rounded-xl bg-emerald-500 text-neutral-950 py-2 font-medium hover:bg-emerald-400"
        >
          Accept
        </button>
      </div>
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
  return (
    <section className="rounded-2xl bg-neutral-900 border border-emerald-900/40 p-4 space-y-3">
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
