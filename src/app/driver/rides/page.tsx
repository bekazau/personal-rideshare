import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RidesHistory, type RideEntry } from "./RidesHistory";

export const dynamic = "force-dynamic";

export default async function DriverRidesPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin?next=/driver/rides");

  const { data: driverExists } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!driverExists) redirect("/driver/onboarding");

  const { data: rides } = await supabase
    .from("rides")
    .select(
      "id, status, pickup_address, dropoff_address, base_fare_cents, total_cents, scheduled_for, requested_at, completed_at, paid_at, payment_method"
    )
    .eq("driver_id", userId)
    .order("requested_at", { ascending: false })
    .limit(100);

  return <RidesHistory rides={(rides ?? []) as RideEntry[]} />;
}
