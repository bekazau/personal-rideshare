import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "@/app/signin/SignInForm";
import { RiderApp } from "./RiderApp";
import { claimInvite } from "@/app/actions/rider";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ inviteCode: string }>;
}

export default async function RiderPage({ params }: PageProps) {
  const { inviteCode } = await params;
  const supabase = await createClient();

  // Look up the driver by invite code (no auth needed).
  const { data: driver } = await supabase
    .from("drivers")
    .select(
      "id, display_name, invite_code, status, last_area_name, last_location_at, base_fare_cents, first_ride_free_on, first_ride_discount_pct, pay_cashapp, pay_venmo, pay_paypal, pay_zelle, pay_applepay, pay_cash_enabled"
    )
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (!driver) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold">Invite not found</h1>
        <p className="text-sm text-neutral-400 mt-2">
          This invite link is invalid or has expired. Ask your driver for a new one.
        </p>
      </main>
    );
  }

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;

  // Not signed in: prompt sign-in. After auth, claimInvite runs in RiderApp.
  if (!userId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-sm w-full space-y-6 text-center">
          <header className="space-y-2">
            <p className="text-xs text-neutral-500 uppercase tracking-wider">
              Invited by
            </p>
            <h1 className="text-2xl font-semibold">{driver.display_name}</h1>
            <p className="text-sm text-neutral-400">
              Sign in to book a ride with this driver. We&apos;ll email you a link.
            </p>
          </header>
          <SignInForm next={`/ride/${inviteCode}`} />
        </div>
      </main>
    );
  }

  // Signed in: make sure the rider profile + link exist (idempotent).
  const result = await claimInvite(inviteCode);
  if (result.error) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">Couldn&apos;t link you to this driver</h1>
        <p className="text-sm text-neutral-400 mt-2">{result.error}</p>
      </main>
    );
  }

  // Check for any active or recently completed ride.
  const { data: activeRide } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driver.id)
    .eq("rider_id", userId)
    .in("status", ["pending", "accepted", "en_route", "arrived", "in_progress", "completed"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return <RiderApp driver={driver} initialActiveRide={activeRide ?? null} />;
}
