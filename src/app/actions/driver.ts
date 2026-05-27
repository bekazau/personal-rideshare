"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocode, isInsideHomeZone } from "@/lib/geo";
import type { DriverStatus } from "@/lib/types/database";

async function getCurrentUserId() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ?? null;
}

export interface OnboardingInput {
  displayName: string;
  baseFareCents: number;
  homeLat: number | null;
  homeLng: number | null;
  homeRadiusMeters: number;
  payCashapp: string | null;
  payVenmo: string | null;
  payPaypal: string | null;
  payZelle: string | null;
  payApplepay: string | null;
  payCashEnabled: boolean;
  firstRideFreeOn: boolean;
  firstRideDiscountPct: number;
}

export async function completeOnboarding(input: OnboardingInput) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Not signed in." };

  if (!input.displayName.trim()) return { error: "Please enter your name." };
  if (input.baseFareCents < 0) return { error: "Base fare must be ≥ 0." };

  const supabase = await createClient();

  // Generate a unique short invite code on first onboarding.
  let inviteCode = nanoid(8).toLowerCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("drivers")
      .select("id")
      .eq("invite_code", inviteCode)
      .maybeSingle();
    if (!existing) break;
    inviteCode = nanoid(8).toLowerCase();
  }

  const { error } = await supabase.from("drivers").upsert({
    id: userId,
    display_name: input.displayName.trim(),
    invite_code: inviteCode,
    base_fare_cents: input.baseFareCents,
    home_lat: input.homeLat,
    home_lng: input.homeLng,
    home_radius_meters: input.homeRadiusMeters,
    pay_cashapp: input.payCashapp || null,
    pay_venmo: input.payVenmo || null,
    pay_paypal: input.payPaypal || null,
    pay_zelle: input.payZelle || null,
    pay_applepay: input.payApplepay || null,
    pay_cash_enabled: input.payCashEnabled,
    first_ride_free_on: input.firstRideFreeOn,
    first_ride_discount_pct: input.firstRideDiscountPct,
  });

  if (error) return { error: error.message };

  revalidatePath("/driver");
  return { ok: true, inviteCode };
}

export async function setDriverStatus(status: DriverStatus) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("drivers")
    .update({ status })
    .eq("id", userId);

  if (error) return { error: error.message };
  revalidatePath("/driver");
  return { ok: true };
}

export interface LocationInput {
  lat: number;
  lng: number;
}

export async function captureDriverLocation(input: LocationInput) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Not signed in." };

  const supabase = await createClient();
  const { data: driver } = await supabase
    .from("drivers")
    .select("home_lat, home_lng, home_radius_meters")
    .eq("id", userId)
    .maybeSingle();

  if (!driver) return { error: "Driver not found." };

  // If inside home zone, do not update rider-facing location data.
  const insideHome = isInsideHomeZone(
    { lat: input.lat, lng: input.lng },
    {
      lat: driver.home_lat,
      lng: driver.home_lng,
      radiusMeters: driver.home_radius_meters,
    }
  );

  if (insideHome) {
    return { ok: true, suppressed: true };
  }

  const areaName = await reverseGeocode(input.lat, input.lng);

  const { error } = await supabase
    .from("drivers")
    .update({
      last_lat: input.lat,
      last_lng: input.lng,
      last_area_name: areaName,
      last_location_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };
  return { ok: true, areaName };
}
