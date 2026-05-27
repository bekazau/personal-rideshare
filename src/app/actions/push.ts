"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSubscription(sub: PushSub) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { error: "Not signed in." };

  const userAgent = (await headers()).get("user-agent");

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: userAgent,
      },
      { onConflict: "endpoint" }
    );

  if (error) return { error: error.message };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { error: "Not signed in." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) return { error: error.message };
  return { ok: true };
}
