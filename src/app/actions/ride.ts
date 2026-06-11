"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { forwardGeocode, getDirectionsSummary, type DirectionsSummary } from "@/lib/geo";
import type { PaymentMethod, RideStatus } from "@/lib/types/database";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ?? null;
}

// =============================================================================
// Rider → driver: request a ride (no price yet — the driver quotes it)
// =============================================================================
export interface RideRequestInput {
  driverInviteCode: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  notes?: string;
  // ISO timestamp when the ride is scheduled for; omit/null = "now".
  scheduledFor?: string | null;
}

export async function requestRide(input: RideRequestInput) {
  const riderId = await getUserId();
  if (!riderId) return { error: "Not signed in." };
  if (!input.pickupAddress.trim()) return { error: "Pickup address is required." };
  if (!input.dropoffAddress.trim()) return { error: "Dropoff address is required." };

  const supabase = await createClient();

  // Find driver by invite code.
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, status")
    .eq("invite_code", input.driverInviteCode)
    .maybeSingle();

  if (!driver) return { error: "Driver not found." };
  if (driver.status === "offline") return { error: "Driver is offline." };

  // Is this the rider's first ride with this driver? (Shown to the driver as a
  // hint when they quote — there's no automatic discount anymore.)
  const { count: priorRides } = await supabase
    .from("rides")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driver.id)
    .eq("rider_id", riderId)
    .neq("status", "cancelled")
    .neq("status", "declined");

  const isFirstRide = (priorRides ?? 0) === 0;

  // Coordinates come from the address autocomplete; fall back to geocoding the
  // text just in case (so the driver's route map always has points).
  let pickupLat: number | null = input.pickupLat ?? null;
  let pickupLng: number | null = input.pickupLng ?? null;
  if (pickupLat == null || pickupLng == null) {
    const g = await forwardGeocode(input.pickupAddress);
    if (g) ({ lat: pickupLat, lng: pickupLng } = g);
  }
  let dropoffLat: number | null = input.dropoffLat ?? null;
  let dropoffLng: number | null = input.dropoffLng ?? null;
  if (dropoffLat == null || dropoffLng == null) {
    const g = await forwardGeocode(input.dropoffAddress);
    if (g) ({ lat: dropoffLat, lng: dropoffLng } = g);
  }

  const scheduledFor = input.scheduledFor?.trim() || null;

  const { data: ride, error } = await supabase
    .from("rides")
    .insert({
      driver_id: driver.id,
      rider_id: riderId,
      pickup_address: input.pickupAddress,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dropoff_address: input.dropoffAddress,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
      rider_notes: input.notes ?? null,
      scheduled_for: scheduledFor,
      // No price yet — the driver sends a quote. total_cents stays 0 until then.
      base_fare_cents: 0,
      discount_cents: 0,
      tip_cents: 0,
      is_first_ride: isFirstRide,
    })
    .select("id")
    .single();

  if (error || !ride) return { error: error?.message || "Couldn't create ride." };

  // Fire-and-wait: ride is already created, push is best-effort.
  await sendPushToUser(driver.id, {
    title: scheduledFor ? "New ride request (scheduled)" : "New ride request",
    body: `${input.pickupAddress} → ${input.dropoffAddress}`,
    url: "/driver/dashboard",
    kind: "new_ride",
    tag: `ride:${ride.id}`,
    requireInteraction: true,
  });

  revalidatePath("/driver/dashboard");
  return { ok: true, rideId: ride.id };
}

// =============================================================================
// Driver → rider: send a price quote; rider confirms or declines
// =============================================================================
export async function sendQuote(rideId: string, amountCents: number) {
  const driverId = await getUserId();
  if (!driverId) return { error: "Not signed in." };
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { error: "Enter a valid price." };
  }

  const supabase = await createClient();
  const { data: ride } = await supabase
    .from("rides")
    .select("status, driver_id, rider_id")
    .eq("id", rideId)
    .maybeSingle();

  if (!ride) return { error: "Ride not found." };
  if (ride.driver_id !== driverId) return { error: "Not your ride." };
  if (ride.status !== "pending") return { error: "This request can no longer be quoted." };

  const { error } = await supabase
    .from("rides")
    .update({ base_fare_cents: amountCents, status: "quoted" })
    .eq("id", rideId);
  if (error) return { error: error.message };

  // Build a rider-facing URL via the driver's invite code.
  const { data: driver } = await supabase
    .from("drivers")
    .select("invite_code")
    .eq("id", driverId)
    .maybeSingle();
  await sendPushToUser(ride.rider_id, {
    title: "Your driver sent a price",
    body: `Tap to review and confirm your ride.`,
    url: driver?.invite_code ? `/ride/${driver.invite_code}` : "/",
    kind: "ride_update",
    tag: `ride:${rideId}`,
    requireInteraction: true,
  });

  revalidatePath("/driver/dashboard");
  return { ok: true };
}

export async function respondToQuote(rideId: string, accept: boolean) {
  const riderId = await getUserId();
  if (!riderId) return { error: "Not signed in." };

  const supabase = await createClient();
  const { data: ride } = await supabase
    .from("rides")
    .select("status, driver_id, rider_id")
    .eq("id", rideId)
    .maybeSingle();

  if (!ride) return { error: "Ride not found." };
  if (ride.rider_id !== riderId) return { error: "Not your ride." };
  if (ride.status !== "quoted") return { error: "This quote is no longer open." };

  const patch = accept
    ? { status: "accepted" as const, accepted_at: new Date().toISOString() }
    : { status: "declined" as const, cancelled_at: new Date().toISOString() };

  const { error } = await supabase.from("rides").update(patch).eq("id", rideId);
  if (error) return { error: error.message };

  await sendPushToUser(ride.driver_id, {
    title: accept ? "Ride confirmed" : "Rider declined the quote",
    body: "",
    url: "/driver/dashboard",
    kind: "ride_update",
    tag: `ride:${rideId}`,
  });

  revalidatePath("/driver/dashboard");
  return { ok: true };
}

// =============================================================================
// Driving estimates for a ride (trip time, and optionally ETA to pickup)
// =============================================================================
export interface RideEstimateResult {
  ok: true;
  trip: DirectionsSummary | null;
  pickup: DirectionsSummary | null;
}

export async function getRideEstimate(
  rideId: string,
  driverLat?: number,
  driverLng?: number
): Promise<RideEstimateResult | { error: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not signed in." };

  const supabase = await createClient();
  const { data: ride } = await supabase
    .from("rides")
    .select("pickup_lat, pickup_lng, dropoff_lat, dropoff_lng")
    .eq("id", rideId)
    .maybeSingle();
  if (!ride) return { error: "Ride not found." };

  const { pickup_lat: plat, pickup_lng: plng, dropoff_lat: dlat, dropoff_lng: dlng } =
    ride;

  let trip: DirectionsSummary | null = null;
  if (plat != null && plng != null && dlat != null && dlng != null) {
    trip = await getDirectionsSummary({ lat: plat, lng: plng }, { lat: dlat, lng: dlng });
  }

  let pickup: DirectionsSummary | null = null;
  if (
    driverLat != null &&
    driverLng != null &&
    plat != null &&
    plng != null
  ) {
    pickup = await getDirectionsSummary(
      { lat: driverLat, lng: driverLng },
      { lat: plat, lng: plng }
    );
  }

  return { ok: true, trip, pickup };
}

// =============================================================================
// Rider sets a tip at payment time (total = quote + tip)
// =============================================================================
export async function setRideTip(rideId: string, tipCents: number) {
  const riderId = await getUserId();
  if (!riderId) return { error: "Not signed in." };
  if (!Number.isInteger(tipCents) || tipCents < 0) return { error: "Invalid tip." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rides")
    .update({ tip_cents: tipCents })
    .eq("id", rideId)
    .eq("rider_id", riderId);

  if (error) return { error: error.message };
  return { ok: true };
}

// =============================================================================
// Driver → ride state machine
// =============================================================================
const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  // pending → quoted happens via sendQuote; quoted → accepted/declined via
  // respondToQuote. The driver can still decline/cancel at either stage.
  pending: ["declined", "cancelled"],
  quoted: ["declined", "cancelled"],
  accepted: ["en_route", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  declined: [],
};

export async function updateRideStatus(rideId: string, next: RideStatus) {
  const driverId = await getUserId();
  if (!driverId) return { error: "Not signed in." };

  const supabase = await createClient();
  const { data: ride } = await supabase
    .from("rides")
    .select("status, driver_id, rider_id")
    .eq("id", rideId)
    .maybeSingle();

  if (!ride) return { error: "Ride not found." };
  if (ride.driver_id !== driverId) return { error: "Not your ride." };

  const allowed = ALLOWED_TRANSITIONS[ride.status as RideStatus];
  if (!allowed.includes(next)) {
    return { error: `Cannot transition from ${ride.status} to ${next}.` };
  }

  const patch: Record<string, unknown> = { status: next };
  if (next === "accepted") patch.accepted_at = new Date().toISOString();
  if (next === "completed") patch.completed_at = new Date().toISOString();
  if (next === "cancelled" || next === "declined") {
    patch.cancelled_at = new Date().toISOString();
  }

  const { error } = await supabase.from("rides").update(patch).eq("id", rideId);
  if (error) return { error: error.message };

  // Notify the rider on key transitions.
  const notifyKinds: Partial<Record<RideStatus, string>> = {
    accepted: "Your ride was accepted",
    declined: "Your driver can't take this ride right now",
    en_route: "Driver is on the way",
    arrived: "Driver has arrived",
    completed: "Ride complete — tap to pay",
  };
  const title = notifyKinds[next];
  if (title) {
    await sendPushToUser(ride.rider_id, {
      title,
      body: "",
      url: `/ride/active/${rideId}`,
      kind: "ride_update",
      tag: `ride:${rideId}`,
    });
  }

  revalidatePath("/driver/dashboard");
  return { ok: true };
}

export async function markRidePaid(rideId: string, method: PaymentMethod) {
  const driverId = await getUserId();
  if (!driverId) return { error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rides")
    .update({
      payment_method: method,
      paid_at: new Date().toISOString(),
    })
    .eq("id", rideId)
    .eq("driver_id", driverId);

  if (error) return { error: error.message };
  revalidatePath("/driver/dashboard");
  return { ok: true };
}

// =============================================================================
// Rider opens app → if driver location is stale, ping the driver
// =============================================================================
export async function pingDriverForLocationRefreshIfStale(driverId: string) {
  const supabase = await createClient();
  const { data: driver } = await supabase
    .from("drivers")
    .select("last_location_at, status")
    .eq("id", driverId)
    .maybeSingle();

  if (!driver || driver.status === "offline") return { ok: true, sent: false };

  const STALE_MS = 60 * 60 * 1000; // 1 hour
  const lastAt = driver.last_location_at
    ? new Date(driver.last_location_at).getTime()
    : 0;
  if (Date.now() - lastAt < STALE_MS) return { ok: true, sent: false };

  await sendPushToUser(driverId, {
    title: "A rider is checking on you",
    body: "Tap to refresh your area.",
    url: "/driver/dashboard?refreshLocation=1",
    kind: "refresh_location",
    tag: "refresh-location",
  });
  return { ok: true, sent: true };
}
