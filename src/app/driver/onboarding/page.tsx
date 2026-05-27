import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./Wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/signin?next=/driver/onboarding");

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (driver) redirect("/driver/dashboard");

  const email = claims?.claims?.email ?? "";

  return <OnboardingWizard initialDisplayName={email.split("@")[0] || ""} />;
}
