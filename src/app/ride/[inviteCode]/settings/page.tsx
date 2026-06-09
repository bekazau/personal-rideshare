import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RiderSettingsForm } from "./RiderSettingsForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ inviteCode: string }>;
}

export default async function RiderSettingsPage({ params }: PageProps) {
  const { inviteCode } = await params;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect(`/signin?next=/ride/${inviteCode}/settings`);

  const { data: rider } = await supabase
    .from("riders")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (!rider) redirect(`/ride/${inviteCode}`);

  return (
    <RiderSettingsForm
      inviteCode={inviteCode}
      initialName={rider.display_name}
    />
  );
}
