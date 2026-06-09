import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function DriverSettingsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin?next=/driver/settings");

  const { data: driver } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!driver) redirect("/driver/onboarding");

  return <SettingsForm driver={driver} />;
}
