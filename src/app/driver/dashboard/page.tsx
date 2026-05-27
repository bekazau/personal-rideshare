import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DriverDashboard() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin?next=/driver");

  const { data: driver } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!driver) redirect("/driver/onboarding");

  const { data: rides } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", userId)
    .in("status", ["pending", "accepted", "en_route", "arrived", "in_progress", "completed"])
    .order("requested_at", { ascending: false })
    .limit(20);

  return <DashboardClient driver={driver} initialRides={rides ?? []} />;
}
