"use server";

import { createClient } from "@/lib/supabase/server";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ?? null;
}

export async function updateRiderName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Please enter a name." };
  if (trimmed.length > 60) return { error: "Name is too long." };

  const userId = await getUserId();
  if (!userId) return { error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("riders")
    .update({ display_name: trimmed })
    .eq("id", userId);

  if (error) return { error: error.message };
  return { ok: true };
}

// Heartbeat ping — rider app calls this every ~30s while open. The driver's
// /driver/riders page reads riders.last_seen_at to show online/offline dots.
export async function pingRiderSeen() {
  const userId = await getUserId();
  if (!userId) return { ok: false };
  const supabase = await createClient();
  await supabase
    .from("riders")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);
  return { ok: true };
}

// Called after the rider lands on /ride/[inviteCode] and signs in.
// Creates a rider row if missing, then links them to the driver.
export async function claimInvite(inviteCode: string, displayName?: string) {
  const userId = await getUserId();
  if (!userId) return { error: "Not signed in." };

  const supabase = await createClient();

  // RLS on `drivers` doesn't permit an unlinked rider to read by invite_code,
  // so we go through the SECURITY DEFINER RPC. See migration 0002.
  const { data: driverRows } = await supabase.rpc("get_driver_by_invite", {
    p_invite_code: inviteCode,
  });
  const driver = Array.isArray(driverRows) ? driverRows[0] : null;

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

  // Note: no revalidatePath here — claimInvite is called from /ride/[inviteCode]/page.tsx
  // during render, and Next.js 16 disallows calling revalidatePath during render.
  // The page is `force-dynamic` so there's nothing to invalidate anyway.
  return { ok: true, driverName: driver.display_name };
}
