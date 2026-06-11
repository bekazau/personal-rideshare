import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "@/app/signin/SignInForm";
import { InstallHint } from "@/components/InstallHint";
import { RiderApp } from "./RiderApp";
import { claimInvite } from "@/app/actions/rider";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ inviteCode: string }>;
}

// Override the root layout's manifest link so this route advertises a
// per-invite manifest. iOS reads start_url + id from the manifest at
// "Add to Home Screen" time and treats this as a distinct PWA from the
// driver app.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { inviteCode } = await params;
  return {
    manifest: `/ride/${inviteCode}/manifest.webmanifest`,
  };
}

export default async function RiderPage({ params }: PageProps) {
  const { inviteCode } = await params;
  const supabase = await createClient();

  // Look up the driver by invite code via a SECURITY DEFINER RPC — anonymous
  // riders can't read the `drivers` table directly under RLS, and on the
  // rider's first visit they're not yet linked. See migration 0002.
  const { data: driverRows } = await supabase.rpc("get_driver_by_invite", {
    p_invite_code: inviteCode,
  });
  const driver = Array.isArray(driverRows) ? driverRows[0] ?? null : null;

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
      <main className="flex-1 flex flex-col items-center px-6 pt-12 pb-12">
        <div className="max-w-sm w-full space-y-6">
          <header className="space-y-2 text-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wider">
              Invited by
            </p>
            <h1 className="text-2xl font-semibold">{driver.display_name}</h1>
            <p className="text-sm text-neutral-400">
              Sign in to book a ride. We&apos;ll email you a 6-digit code.
            </p>
          </header>
          <InstallHint />
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

  // Fetch the rider's own row so they can see + edit their display name.
  const { data: rider } = await supabase
    .from("riders")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  // Check for any active or recently completed ride.
  const { data: activeRide } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driver.id)
    .eq("rider_id", userId)
    .in("status", ["pending", "quoted", "accepted", "en_route", "arrived", "in_progress", "completed"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <RiderApp
      driver={driver}
      rider={rider ?? { id: userId, display_name: "Rider" }}
      initialActiveRide={activeRide ?? null}
    />
  );
}
