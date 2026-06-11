"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestRide, respondToQuote, setRideTip } from "@/app/actions/ride";
import {
  pushSupported,
  registerServiceWorker,
  subscribeBrowserToPush,
} from "@/lib/push-client";
import { savePushSubscription } from "@/app/actions/push";
import { pingDriverForLocationRefreshIfStale } from "@/app/actions/ride";
import { pingRiderSeen, updateRiderName } from "@/app/actions/rider";
import { RiderMenu } from "@/components/RiderMenu";
import { DriverAreaMap } from "@/components/DriverAreaMap";
import { getBrowserPosition } from "@/lib/geo";
import { formatUsd } from "@/lib/fare";
import { TipSelector } from "@/components/TipSelector";
import { PaymentMenu } from "@/components/PaymentMenu";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { RouteMap } from "@/components/RouteMap";
import { RideEstimate } from "@/components/RideEstimate";
import type { DriverRow, RideRow } from "@/lib/types/database";

type RiderDriver = Pick<
  DriverRow,
  | "id"
  | "display_name"
  | "invite_code"
  | "status"
  | "last_lat"
  | "last_lng"
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

interface RiderSelf {
  id: string;
  display_name: string;
}

interface Props {
  driver: RiderDriver;
  rider: RiderSelf;
  initialActiveRide: RideRow | null;
}

export function RiderApp({ driver: initialDriver, rider: initialRider, initialActiveRide }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [driver, setDriver] = useState<RiderDriver>(initialDriver);
  const [rider, setRider] = useState<RiderSelf>(initialRider);
  const [activeRide, setActiveRide] = useState<RideRow | null>(initialActiveRide);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ----- Heartbeat: ping last_seen_at so driver sees "online" dot ------------
  useEffect(() => {
    pingRiderSeen().catch(() => {});
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        pingRiderSeen().catch(() => {});
      }
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") pingRiderSeen().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // ----- Name edit ------------------------------------------------------------
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(rider.display_name);
  const [nameSaving, setNameSaving] = useState(false);

  async function saveName() {
    setError(null);
    setNameSaving(true);
    const result = await updateRiderName(nameDraft);
    setNameSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRider((r) => ({ ...r, display_name: nameDraft.trim() }));
    setNameEditing(false);
  }

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

  // ----- Polling fallback for driver state ------------------------------------
  // Realtime postgres_changes can silently drop on iOS PWA (WebSocket suspends
  // when backgrounded, RLS quirks, etc). Re-fetch the driver via the RPC every
  // 15s and instantly when the page becomes visible again.
  const refreshDriver = useCallback(async () => {
    const { data } = await supabase.rpc("get_driver_by_invite", {
      p_invite_code: driver.invite_code,
    });
    const next = Array.isArray(data) ? (data[0] as Partial<RiderDriver> | undefined) : undefined;
    if (next) setDriver((d) => ({ ...d, ...next }));
  }, [supabase, driver.invite_code]);

  useEffect(() => {
    const interval = setInterval(refreshDriver, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshDriver();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshDriver]);

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
  // Both addresses are picked from autocomplete, so each carries verified
  // coordinates; the *Sel state is null until a suggestion is chosen.
  const [pickup, setPickup] = useState("");
  const [pickupSel, setPickupSel] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState("");
  const [dropoffSel, setDropoffSel] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState(""); // datetime-local value

  // Bias address suggestions toward the driver's area when we know it.
  // Memoized so AddressAutocomplete's effect (which depends on it) is stable.
  const proximity = useMemo(
    () =>
      driver.last_lat != null && driver.last_lng != null
        ? { lat: driver.last_lat, lng: driver.last_lng }
        : null,
    [driver.last_lat, driver.last_lng]
  );

  async function useCurrentLocation() {
    try {
      const pos = await getBrowserPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setPickupSel({ lat, lng });
      setPickup(`My current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    } catch (e) {
      setError("Couldn't get your location: " + (e as Error).message);
    }
  }

  const canSubmit = !!pickupSel && !!dropoffSel && (when === "now" || !!scheduledFor);

  function submitRequest() {
    setError(null);
    if (!pickupSel || !dropoffSel) {
      setError("Pick a pickup and dropoff from the suggestions.");
      return;
    }
    if (when === "later" && !scheduledFor) {
      setError("Choose a date and time for your scheduled ride.");
      return;
    }
    startTransition(async () => {
      const result = await requestRide({
        driverInviteCode: driver.invite_code,
        pickupAddress: pickup,
        pickupLat: pickupSel.lat,
        pickupLng: pickupSel.lng,
        dropoffAddress: dropoff,
        dropoffLat: dropoffSel.lat,
        dropoffLng: dropoffSel.lng,
        notes: notes || undefined,
        scheduledFor: when === "later" ? new Date(scheduledFor).toISOString() : null,
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
      setPickupSel(null);
      setDropoff("");
      setDropoffSel(null);
      setNotes("");
      setWhen("now");
      setScheduledFor("");
    });
  }

  function respondQuote(accept: boolean) {
    if (!activeRide) return;
    setError(null);
    const rideId = activeRide.id;
    startTransition(async () => {
      const result = await respondToQuote(rideId, accept);
      if (result.error) {
        setError(result.error);
        return;
      }
      const supa = createClient();
      const { data } = await supa.from("rides").select("*").eq("id", rideId).maybeSingle();
      if (data) setActiveRide(data as RideRow);
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
    <main className="flex-1 px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-6">
      <header className="flex items-start gap-3">
        <RiderMenu inviteCode={driver.invite_code} />
        <div className="flex-1 space-y-1">
          <p className="text-xs text-neutral-500 uppercase tracking-wider">Your driver</p>
          <h1 className="text-2xl font-semibold">{driver.display_name}</h1>
        </div>
      </header>

      {/* Rider's own name — editable inline */}
      <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
        {nameEditing ? (
          <div className="space-y-2">
            <p className="text-xs text-neutral-400 uppercase tracking-wider">Your name</p>
            <input
              className="input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="What should your driver call you?"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setNameEditing(false);
                  setNameDraft(rider.display_name);
                }}
                className="rounded-xl bg-neutral-800 text-neutral-300 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveName}
                disabled={nameSaving || !nameDraft.trim()}
                className="rounded-xl bg-white text-neutral-950 py-2 text-sm font-medium disabled:opacity-50"
              >
                {nameSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-neutral-400 uppercase tracking-wider">You</p>
              <p className="font-medium truncate">{rider.display_name}</p>
            </div>
            <button
              onClick={() => {
                setNameDraft(rider.display_name);
                setNameEditing(true);
              }}
              className="text-xs text-neutral-400 underline shrink-0"
            >
              Edit name
            </button>
          </div>
        )}
      </section>

      {/* Status card */}
      <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${statusDot[driver.status]}`} />
          <span className="font-medium capitalize">{driver.status}</span>
        </div>
        {driver.status !== "offline" && (
          <DriverAreaMap
            lat={driver.last_lat}
            lng={driver.last_lng}
            lastSeenAt={driver.last_location_at}
            areaName={driver.last_area_name}
            driverName={driver.display_name}
          />
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

      {/* Pending — waiting for the driver to send a price */}
      {activeRide && activeRide.status === "pending" && (
        <ActiveRideView ride={activeRide} />
      )}

      {/* Quote — rider confirms or declines the driver's price */}
      {activeRide && activeRide.status === "quoted" && (
        <QuoteConfirmCard ride={activeRide} pending={pending} onRespond={respondQuote} />
      )}

      {/* Active ride (accepted onward, before completion) */}
      {activeRide &&
        ["accepted", "en_route", "arrived", "in_progress"].includes(activeRide.status) && (
          <ActiveRideView ride={activeRide} />
        )}

      {/* Completed ride awaiting payment — rider chooses a tip, then pays */}
      {activeRide && activeRide.status === "completed" && !activeRide.paid_at && (
        <RiderPayment ride={activeRide} driver={driver} />
      )}

      {/* Request form */}
      {showRequestForm && driver.status !== "offline" && (
        <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
          <h2 className="font-medium">Request a ride</h2>

          <div className="space-y-1">
            <AddressAutocomplete
              label="Pickup"
              placeholder="Search pickup address"
              value={pickup}
              selected={!!pickupSel}
              onTextChange={(t) => {
                setPickup(t);
                setPickupSel(null);
              }}
              onSelect={(s) => {
                setPickup(s.name);
                setPickupSel({ lat: s.lat, lng: s.lng });
              }}
              proximity={proximity}
            />
            <button
              onClick={useCurrentLocation}
              className="text-xs text-neutral-400 underline"
            >
              Use my current location
            </button>
          </div>

          <AddressAutocomplete
            label="Dropoff"
            placeholder="Search dropoff address"
            value={dropoff}
            selected={!!dropoffSel}
            onTextChange={(t) => {
              setDropoff(t);
              setDropoffSel(null);
            }}
            onSelect={(s) => {
              setDropoff(s.name);
              setDropoffSel({ lat: s.lat, lng: s.lng });
            }}
            proximity={proximity}
          />

          {/* When: now or scheduled */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-400">When</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWhen("now")}
                className={`rounded-lg py-2 text-sm font-medium transition ${
                  when === "now"
                    ? "bg-white text-neutral-950"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => setWhen("later")}
                className={`rounded-lg py-2 text-sm font-medium transition ${
                  when === "later"
                    ? "bg-white text-neutral-950"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                For later
              </button>
            </div>
            {when === "later" && (
              <input
                type="datetime-local"
                className="input"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            )}
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

          <p className="text-xs text-neutral-500">
            Your driver will review and send a price for you to confirm before the ride.
          </p>

          <button
            onClick={submitRequest}
            disabled={pending || !canSubmit}
            className="w-full rounded-xl bg-white text-neutral-950 py-3 font-medium disabled:opacity-50"
          >
            {pending
              ? "Sending request…"
              : when === "later"
                ? "Request scheduled ride"
                : "Request ride"}
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

function formatSchedule(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ScheduledBadge({ iso }: { iso: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium px-2 py-0.5">
      ⏰ Scheduled · {formatSchedule(iso)}
    </span>
  );
}

function ActiveRideView({ ride }: { ride: RideRow }) {
  const labels: Record<string, string> = {
    pending: "Waiting for your driver to send a price…",
    accepted: "Driver accepted — getting ready",
    en_route: "Driver is on the way",
    arrived: "Driver has arrived",
    in_progress: "Ride in progress",
  };
  return (
    <section className="rounded-2xl bg-neutral-900 border border-emerald-900/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-emerald-400">
          {ride.status.replace("_", " ")}
        </p>
        {ride.scheduled_for && <ScheduledBadge iso={ride.scheduled_for} />}
      </div>
      <p className="font-medium">{labels[ride.status] || ride.status}</p>
      <p className="text-sm text-neutral-400">Pickup: {ride.pickup_address}</p>
      {ride.dropoff_address && (
        <p className="text-sm text-neutral-400">Dropoff: {ride.dropoff_address}</p>
      )}
      {ride.pickup_lat != null && ride.dropoff_lat != null && (
        <RouteMap rideId={ride.id} label={ride.pickup_address} />
      )}
      <RideEstimate rideId={ride.id} />
      {ride.total_cents > 0 && (
        <p className="text-sm text-neutral-400">Total: {formatUsd(ride.total_cents)}</p>
      )}
    </section>
  );
}

function QuoteConfirmCard({
  ride,
  pending,
  onRespond,
}: {
  ride: RideRow;
  pending: boolean;
  onRespond: (accept: boolean) => void;
}) {
  return (
    <section className="rounded-2xl bg-neutral-900 border border-sky-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-sky-400">Quote</p>
        {ride.scheduled_for && <ScheduledBadge iso={ride.scheduled_for} />}
      </div>
      <p className="font-medium">Your driver quoted this ride at</p>
      <p className="text-3xl font-semibold">{formatUsd(ride.base_fare_cents)}</p>
      <p className="text-sm text-neutral-400">Pickup: {ride.pickup_address}</p>
      {ride.dropoff_address && (
        <p className="text-sm text-neutral-400">Dropoff: {ride.dropoff_address}</p>
      )}
      {ride.pickup_lat != null && ride.dropoff_lat != null && (
        <RouteMap rideId={ride.id} label={ride.pickup_address} />
      )}
      <RideEstimate rideId={ride.id} />
      <p className="text-xs text-neutral-500">You can add a tip when you pay.</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onRespond(false)}
          disabled={pending}
          className="rounded-xl bg-neutral-800 text-neutral-300 py-2.5 font-medium hover:bg-neutral-700 disabled:opacity-50"
        >
          Decline
        </button>
        <button
          onClick={() => onRespond(true)}
          disabled={pending}
          className="rounded-xl bg-emerald-500 text-neutral-950 py-2.5 font-medium hover:bg-emerald-400 disabled:opacity-50"
        >
          Confirm ride
        </button>
      </div>
    </section>
  );
}

function RiderPayment({ ride, driver }: { ride: RideRow; driver: RiderDriver }) {
  const [tipCents, setTipCents] = useState(0);
  const total = ride.base_fare_cents + tipCents;

  function changeTip(cents: number) {
    setTipCents(cents);
    // Persist the tip so the total/record reflects it; best-effort.
    setRideTip(ride.id, cents).catch(() => {});
  }

  return (
    <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
      <h2 className="font-medium">Ride complete — please pay</h2>
      <div className="text-sm space-y-1 border-t border-neutral-800 pt-2">
        <div className="flex justify-between">
          <span className="text-neutral-400">Ride</span>
          <span>{formatUsd(ride.base_fare_cents)}</span>
        </div>
        {tipCents > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-400">Tip</span>
            <span>{formatUsd(tipCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium pt-1 border-t border-neutral-800">
          <span>Total</span>
          <span>{formatUsd(total)}</span>
        </div>
      </div>
      <TipSelector baseFareCents={ride.base_fare_cents} discountCents={0} onChange={changeTip} />
      <PaymentMenu driver={driver} totalCents={total} />
    </section>
  );
}
