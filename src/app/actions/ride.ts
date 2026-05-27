"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { calculateFare } from "@/lib/fare";
import type { PaymentMethod, RideStatus } from "@/lib/types/database";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ?? null;
}

// =============================================================================
// Rider → driver: request a ride
// =============================================================================
export interface RideRequestInput {
  driverInviteCode: string;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress?: string;
  notes?: string;
  tipCents: number;
}

export async function requestRide(input: RideRequestInput) {
  const riderId = await getUserId();
  if (!riderId) return { error: "Not signed in." };
  if (!input.pickupAddress.trim()) return { error: "Pickup address is required." };

  const supabase = await createClient();

  // Find driver by invite code.
  const { data: driver } = await supabase
    .from("drivers")
    .select(
      "id, base_fare_cents, first_ride_free_on, first_ride_discount_pct, status"
    )
    .eq("invite_code", input.driverInviteCode)
    .maybeSingle();

  if (!driver) return { error: "Driver not found." };
  if (driver.status === "offline") return { error: "Driver is offline." };

  // Is this the rider's first ride with this driver?
  const { count: priorRides } = await supabase
    .from("rides")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driver.id)
    .eq("rider_id", riderId)
    .neq("status", "cancelled")
    .neq("status", "declined");

  const isFirstRide = (priorRides ?? 0) === 0;

  const fare = calculateFare({
    baseFareCents: driver.base_fare_cents,
    tipCents: input.tipCents,
    isFirstRide,
    firstRideFreeOn: driver.first_ride_free_on,
    firstRideDiscountPct: driver.first_ride_discount_pct,
  });

  const { data: ride, error } = await supabase
    .from("rides")
    .insert({
      driver_id: driver.id,
      rider_id: riderId,
      pickup_address: input.pickupAddress,
      pickup_lat: input.pickupLat ?? null,
      pickup_lng: input.pickupLng ?? null,
      dropoff_address: input.dropoffAddress ?? null,
      rider_notes: input.notes ?? null,
      base_fare_cents: fare.baseCents,
      discount_cents: fare.discountCents,
      tip_cents: fare.tipCents,
      is_first_ride: isFirstRide,
    })
    .select("id")
    .single();

  if (error || !ride) return { error: error?.message || "Couldn't create ride." };

  // Fire-and-wait: ride is already created, push is best-effort.
  await sendPushToUser(driver.id, {
    title: "New ride request",
    body: `Pickup: ${input.pickupAddress}`,
    url: "/driver/dashboard",
    kind: "new_ride",
    tag: `ride:${ride.id}`,
    requireInteraction: true,
  });

  revalidatePath("/driver/dashboard");
  return { ok: true, rideId: ride.id };
}

// =============================================================================
// Driver → ride state machine
// =============================================================================
const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  pending: ["accepted", "declined", "cancelled"],
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
