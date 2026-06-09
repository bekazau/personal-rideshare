import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppMenu } from "@/components/AppMenu";
import { InvitePageContent } from "./InvitePageContent";

export const dynamic = "force-dynamic";

export default async function DriverInvitePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin?next=/driver/invite");

  const { data: driver } = await supabase
    .from("drivers")
    .select("invite_code")
    .eq("id", userId)
    .maybeSingle();

  if (!driver) redirect("/driver/onboarding");

  return (
    <main className="flex-1 flex flex-col px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-4">
      <header className="flex items-start gap-3">
        <AppMenu />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Invite link</h1>
        </div>
      </header>

      <InvitePageContent inviteCode={driver.invite_code} />
    </main>
  );
}
