import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DriverEntry() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;

  if (!userId) {
    redirect("/signin?next=/driver");
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!driver) {
    redirect("/driver/onboarding");
  }

  redirect("/driver/dashboard");
}
