import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RidersList, type RiderEntry } from "./RidersList";

export const dynamic = "force-dynamic";

export default async function DriverRidersPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin?next=/driver/riders");

  // Make sure they're actually a registered driver before showing the list.
  const { data: driverExists } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!driverExists) redirect("/driver/onboarding");

  // Riders linked to this driver — join through driver_rider_links.
  const { data: links } = await supabase
    .from("driver_rider_links")
    .select("invited_at, riders(id, display_name, last_seen_at)")
    .eq("driver_id", userId)
    .order("invited_at", { ascending: false });

  type RiderJoin = { id: string; display_name: string; last_seen_at: string | null };
  type LinkJoin = { invited_at: string; riders: RiderJoin | RiderJoin[] | null };

  const initial: RiderEntry[] = (links ?? [])
    .map((row) => {
      const linkRow = row as unknown as LinkJoin;
      const r = linkRow.riders;
      const rider = Array.isArray(r) ? r[0] : r;
      if (!rider) return null;
      return {
        id: rider.id,
        display_name: rider.display_name,
        last_seen_at: rider.last_seen_at,
        invited_at: linkRow.invited_at,
      };
    })
    .filter((x): x is RiderEntry => x !== null);

  return <RidersList initial={initial} />;
}
