import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RiderMenu } from "@/components/RiderMenu";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ inviteCode: string }>;
}

// Chat list — shows every driver this rider is linked to. Tap one → thread.
// One-driver today, but the rider may have multiple driver links in the future.
export default async function RiderChatListPage({ params }: PageProps) {
  const { inviteCode } = await params;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect(`/signin?next=/ride/${inviteCode}/chat`);

  // Pull every driver this rider is linked to (with display name).
  // RLS lets the rider read drivers they're linked to.
  const { data: links } = await supabase
    .from("driver_rider_links")
    .select("driver_id, invited_at, drivers(id, display_name, status)")
    .eq("rider_id", userId)
    .order("invited_at", { ascending: false });

  type DriverJoin = { id: string; display_name: string; status: string };
  type LinkJoin = {
    driver_id: string;
    invited_at: string;
    drivers: DriverJoin | DriverJoin[] | null;
  };

  const drivers = (links ?? [])
    .map((row) => {
      const linkRow = row as unknown as LinkJoin;
      const d = linkRow.drivers;
      const driver = Array.isArray(d) ? d[0] : d;
      if (!driver) return null;
      return {
        id: driver.id,
        display_name: driver.display_name,
        status: driver.status,
      };
    })
    .filter((x): x is DriverJoin => x !== null);

  return (
    <main className="flex-1 flex flex-col px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-4">
      <header className="flex items-start gap-3">
        <RiderMenu inviteCode={inviteCode} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Chat</h1>
        </div>
      </header>

      <p className="text-xs text-neutral-500">
        {drivers.length === 0
          ? "No drivers yet."
          : `Choose a driver to message.`}
      </p>

      <ul className="space-y-2">
        {drivers.map((d) => {
          const online = d.status !== "offline";
          return (
            <li key={d.id}>
              <Link
                href={`/ride/${inviteCode}/chat/${d.id}`}
                className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 flex items-center gap-3 hover:bg-neutral-800/70 transition"
              >
                <span
                  aria-label={online ? "Online" : "Offline"}
                  className={`h-3 w-3 rounded-full shrink-0 ${
                    online ? "bg-emerald-500" : "bg-neutral-600"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{d.display_name}</p>
                  <p className="text-xs text-neutral-500 capitalize">{d.status}</p>
                </div>
                <span className="text-neutral-500 shrink-0">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
