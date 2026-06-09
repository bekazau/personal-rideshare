import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "@/components/ChatThread";
import { AppMenu } from "@/components/AppMenu";
import type { MessageRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ riderId: string }>;
}

export default async function DriverChatPage({ params }: PageProps) {
  const { riderId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin?next=/driver/riders");

  // Make sure this rider is actually linked to me.
  const { data: link } = await supabase
    .from("driver_rider_links")
    .select("driver_id, rider_id")
    .eq("driver_id", userId)
    .eq("rider_id", riderId)
    .maybeSingle();

  if (!link) redirect("/driver/riders");

  const { data: rider } = await supabase
    .from("riders")
    .select("id, display_name, last_seen_at")
    .eq("id", riderId)
    .maybeSingle();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("driver_id", userId)
    .eq("rider_id", riderId)
    .order("created_at", { ascending: true });

  const riderName = rider?.display_name ?? "Rider";

  return (
    <main className="flex-1 flex flex-col pt-safe max-w-md mx-auto w-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
        <AppMenu />
        <Link
          href="/driver/riders"
          className="text-neutral-400 hover:text-neutral-200 text-xl shrink-0"
          aria-label="Back to riders"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">{riderName}</h1>
          {rider?.last_seen_at && (
            <p className="text-xs text-neutral-500 truncate">
              Last seen {timeAgo(rider.last_seen_at)}
            </p>
          )}
        </div>
      </header>

      <ChatThread
        driverId={userId}
        riderId={riderId}
        myRole="driver"
        otherName={riderName}
        initialMessages={(messages ?? []) as MessageRow[]}
      />
    </main>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs)) return "—";
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
