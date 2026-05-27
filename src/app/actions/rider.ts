"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ?? null;
}

// Called after the rider lands on /ride/[inviteCode] and signs in.
// Creates a rider row if missing, then links them to the driver.
export async function claimInvite(inviteCode: string, displayName?: string) {
  const userId = await getUserId();
  if (!userId) return { error: "Not signed in." };

  const supabase = await createClient();

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, display_name")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (!driver) return { error: "Invite link is invalid." };

  // Ensure rider row exists.
  const { data: existingRider } = await supabase
    .from("riders")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (!existingRider) {
    const { data: claimsData } = await supabase.auth.getClaims();
    const email = claimsData?.claims?.email ?? "";
    const fallbackName = displayName?.trim() || email.split("@")[0] || "Rider";

    const { error: insertErr } = await supabase
      .from("riders")
      .insert({ id: userId, display_name: fallbackName });
    if (insertErr) return { error: insertErr.message };
  } else if (displayName && displayName.trim() && existingRider.display_name !== displayName.trim()) {
    await supabase
      .from("riders")
      .update({ display_name: displayName.trim() })
      .eq("id", userId);
  }

  // Ensure link exists.
  const { error: linkErr } = await supabase
    .from("driver_rider_links")
    .upsert(
      { driver_id: driver.id, rider_id: userId },
      { onConflict: "driver_id,rider_id", ignoreDuplicates: true }
    );
  if (linkErr) return { error: linkErr.message };

  revalidatePath(`/ride/${inviteCode}`);
  return { ok: true, driverName: driver.display_name };
}
