import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "@/components/ChatThread";
import { RiderMenu } from "@/components/RiderMenu";
import type { MessageRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ inviteCode: string; driverId: string }>;
}

export default async function RiderChatThreadPage({ params }: PageProps) {
  const { inviteCode, driverId } = await params;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect(`/signin?next=/ride/${inviteCode}/chat/${driverId}`);

  // Verify the rider is actually linked to this driver.
  const { data: link } = await supabase
    .from("driver_rider_links")
    .select("driver_id, rider_id")
    .eq("driver_id", driverId)
    .eq("rider_id", userId)
    .maybeSingle();

  if (!link) redirect(`/ride/${inviteCode}/chat`);

  // Read the driver's display name (RLS: linked riders read driver).
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, display_name, status")
    .eq("id", driverId)
    .maybeSingle();

  const driverName = driver?.display_name ?? "Driver";

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("driver_id", driverId)
    .eq("rider_id", userId)
    .order("created_at", { ascending: true });

  return (
    <main className="flex-1 flex flex-col pt-safe max-w-md mx-auto w-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
        <RiderMenu inviteCode={inviteCode} />
        <Link
          href={`/ride/${inviteCode}/chat`}
          className="text-neutral-400 hover:text-neutral-200 text-xl shrink-0"
          aria-label="Back to chats"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">{driverName}</h1>
          {driver?.status && (
            <p className="text-xs text-neutral-500 capitalize">{driver.status}</p>
          )}
        </div>
      </header>

      <ChatThread
        driverId={driverId}
        riderId={userId}
        myRole="rider"
        otherName={driverName}
        initialMessages={(messages ?? []) as MessageRow[]}
      />
    </main>
  );
}
