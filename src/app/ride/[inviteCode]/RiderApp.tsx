"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestRide } from "@/app/actions/ride";
import {
  pushSupported,
  registerServiceWorker,
  subscribeBrowserToPush,
} from "@/lib/push-client";
import { savePushSubscription } from "@/app/actions/push";
import { pingDriverForLocationRefreshIfStale } from "@/app/actions/ride";
import { getBrowserPosition, staleness } from "@/lib/geo";
import { calculateFare, formatUsd } from "@/lib/fare";
import { TipSelector } from "@/components/TipSelector";
import { PaymentMenu } from "@/components/PaymentMenu";
import type { DriverRow, RideRow } from "@/lib/types/database";

type RiderDriver = Pick<
  DriverRow,
  | "id"
  | "display_name"
  | "invite_code"
  | "status"
  | "last_area_name"
  | "last_location_at"
  | "base_fare_cents"
  | "first_ride_free_on"
  | "first_ride_discount_pct"
  | "pay_cashapp"
  | "pay_venmo"
  | "pay_paypal"
  | "pay_zelle"
  | "pay_applepay"
  | "pay_cash_enabled"
>;

interface Props {
  driver: RiderDriver;
  initialActiveRide: RideRow | null;
}

export function RiderApp({ driver: initialDriver, initialActiveRide }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [driver, setDriver] = useState<RiderDriver>(initialDriver);
  const [activeRide, setActiveRide] = useState<RideRow | null>(initialActiveRide);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ----- Realtime: watch driver + active rides --------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`rider-view-${driver.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driver.id}` },
        (payload) => {
          const next = payload.new as Partial<RiderDriver>;
          if (next) setDriver((d) => ({ ...d, ...next }));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides", filter: `driver_id=eq.${driver.id}` },
        (payload) => {
          const next = payload.new as RideRow | null;
          if (!next) return;
          // Only care about rides for this rider.
          setActiveRide((curr) => {
            if (curr && next.id === curr.id) return next;
            // New ride created by this rider (we'll match via id after Insert).
            if (!curr) return null;
            return curr;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, driver.id]);

  // ----- On open: ping driver if location is stale ----------------------------
  useEffect(() => {
    pingDriverForLocationRefreshIfStale(driver.id).catch(() => {});
  }, [driver.id]);

  // ----- Push notifications subscription (one-tap opt-in) ---------------------
  const [pushAsked, setPushAsked] = useState(false);
  async function enablePush() {
    setError(null);
    setPushAsked(true);
    if (!pushSupported()) return;
    try {
      await registerServiceWorker();
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const sub = await subscribeBrowserToPush();
      await savePushSubscription(sub);
    } catch {
      // ignore
    }
  }

  // ----- Ride request form ----------------------------------------------------
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [notes, setNotes] = useState("");
  const [tipCents, setTipCents] = useState(0);
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [isFirstRide, setIsFirstRide] = useState(false);

  // On mount, check whether this would be the rider's first ride with this driver.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supa = createClient();
      const { count } = await supa
        .from("rides")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", driver.id)
        .neq("status", "cancelled")
        .neq("status", "declined");
      if (cancelled) return;
      setIsFirstRide((count ?? 0) === 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [driver.id]);

  const fare = calculateFare({
    baseFareCents: driver.base_fare_cents,
    tipCents,
    isFirstRide,
    firstRideFreeOn: driver.first_ride_free_on,
    firstRideDiscountPct: driver.first_ride_discount_pct,
  });

  async function useCurrentLocation() {
    try {
      const pos = await getBrowserPosition();
      setPickupLat(pos.coords.latitude);
      setPickupLng(pos.coords.longitude);
      setPickup(`(${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`);
    } catch (e) {
      setError("Couldn't get your location: " + (e as Error).message);
    }
  }

  function submitRequest() {
    setError(null);
    startTransition(async () => {
      const result = await requestRide({
        driverInviteCode: driver.invite_code,
        pickupAddress: pickup,
        pickupLat: pickupLat ?? undefined,
        pickupLng: pickupLng ?? undefined,
        dropoffAddress: dropoff || undefined,
        notes: notes || undefined,
        tipCents,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Optimistic: fetch the row we just created so we can show ride state.
      const supa = createClient();
      const { data } = await supa
        .from("rides")
        .select("*")
        .eq("id", result.rideId!)
        .maybeSingle();
      if (data) setActiveRide(data as RideRow);
      setPickup("");
      setDropoff("");
      setNotes("");
      setTipCents(0);
    });
  }

  // ----- Render ---------------------------------------------------------------
  const statusDot: Record<DriverRow["status"], string> = {
    available: "bg-emerald-500",
    busy: "bg-amber-500",
    offline: "bg-neutral-600",
  };

  const showRequestForm = !activeRide || ["completed", "cancelled", "declined"].includes(activeRide.status);

  return (
    <main className="flex-1 px-6 py-6 max-w-md mx-auto w-full space-y-6 pb-24">
      <header className="space-y-1">
        <p className="text-xs text-neutral-500 uppercase tracking-wider">Your driver</p>
        <h1 className="text-2xl font-semibold">{driver.display_name}</h1>
      </header>

      {/* Status card */}
      <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${statusDot[driver.status]}`} />
          <span className="font-medium capitalize">{driver.status}</span>
        </div>
        {driver.status !== "offline" && driver.last_area_name && (
          <p className="text-xs text-neutral-400">
            Last seen near {driver.last_area_name} · {staleness(driver.last_location_at)}
          </p>
        )}
      </section>

      {/* Push opt-in (only shown if not yet asked) */}
      {!pushAsked && (
        <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
          <p className="text-sm text-neutral-300">
            Get a notification when your driver accepts your ride.
          </p>
          <button
            onClick={enablePush}
            className="w-full rounded-xl bg-white text-neutral-950 py-2 font-medium"
          >
            Enable notifications
          </button>
        </section>
      )}

      {/* Active ride */}
      {activeRide && !showRequestForm && (
        <ActiveRideView ride={activeRide} />
      )}

      {/* Completed ride awaiting payment */}
      {activeRide && activeRide.status === "completed" && !activeRide.paid_at && (
        <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
          <h2 className="font-medium">Ride complete — please pay</h2>
          <p className="text-sm text-neutral-400">
            Tap your driver&apos;s preferred method.
          </p>
          <PaymentMenu driver={driver} totalCents={activeRide.total_cents} />
        </section>
      )}

      {/* Request form */}
      {showRequestForm && driver.status !== "offline" && (
        <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
          <h2 className="font-medium">Request a ride</h2>
          <div className="space-y-1">
            <label className="text-xs text-neutral-400">Pickup</label>
            <input
              className="input"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="Where should they pick you up?"
            />
            <button
              onClick={useCurrentLocation}
              className="text-xs text-neutral-400 underline"
            >
              Use my current location
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-400">Dropoff (optional)</label>
            <input
              className="input"
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder="Where to?"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-400">Notes (optional)</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 2 stops, I have luggage"
            />
          </div>

          <FareBreakdownView
            baseCents={fare.baseCents}
            discountCents={fare.discountCents}
            tipCents={fare.tipCents}
            totalCents={fare.totalCents}
            isFirstRide={fare.isFirstRide && fare.discountCents > 0}
          />

          <TipSelector
            baseFareCents={driver.base_fare_cents}
            discountCents={fare.discountCents}
            onChange={setTipCents}
          />

          <button
            onClick={submitRequest}
            disabled={pending || !pickup.trim()}
            className="w-full rounded-xl bg-white text-neutral-950 py-3 font-medium disabled:opacity-50"
          >
            {pending ? "Sending request…" : `Request — ${formatUsd(fare.totalCents)}`}
          </button>
        </section>
      )}

      {driver.status === "offline" && (
        <p className="text-sm text-neutral-400 text-center italic">
          Driver is offline right now. Check back later.
        </p>
      )}

      {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
    </main>
  );
}

function ActiveRideView({ ride }: { ride: RideRow }) {
  const labels: Record<string, string> = {
    pending: "Waiting for driver to accept…",
    accepted: "Driver accepted — getting ready",
    en_route: "Driver is on the way",
    arrived: "Driver has arrived",
    in_progress: "Ride in progress",
  };
  return (
    <section className="rounded-2xl bg-neutral-900 border border-emerald-900/40 p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider text-emerald-400">
        {ride.status.replace("_", " ")}
      </p>
      <p className="font-medium">{labels[ride.status] || ride.status}</p>
      <p className="text-sm text-neutral-400">
        Pickup: {ride.pickup_address}
      </p>
      {ride.dropoff_address && (
        <p className="text-sm text-neutral-400">Dropoff: {ride.dropoff_address}</p>
      )}
      <p className="text-sm text-neutral-400">
        Total: {formatUsd(ride.total_cents)}
      </p>
    </section>
  );
}

function FareBreakdownView({
  baseCents,
  discountCents,
  tipCents,
  totalCents,
  isFirstRide,
}: {
  baseCents: number;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  isFirstRide: boolean;
}) {
  return (
    <div className="text-sm space-y-1 border-t border-neutral-800 pt-2">
      <div className="flex justify-between">
        <span className="text-neutral-400">Base fare</span>
        <span>{formatUsd(baseCents)}</span>
      </div>
      {isFirstRide && discountCents > 0 && (
        <div className="flex justify-between text-emerald-400">
          <span>First-ride discount</span>
          <span>−{formatUsd(discountCents)}</span>
        </div>
      )}
      {tipCents > 0 && (
        <div className="flex justify-between">
          <span className="text-neutral-400">Tip</span>
          <span>{formatUsd(tipCents)}</span>
        </div>
      )}
      <div className="flex justify-between font-medium pt-1 border-t border-neutral-800">
        <span>Total</span>
        <span>{formatUsd(totalCents)}</span>
      </div>
    </div>
  );
}
