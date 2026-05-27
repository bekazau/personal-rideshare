// Helpers for Web Push — both client and server.

import "server-only";
import webpush from "web-push";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

let configured = false;
function configurePush() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  kind?: "new_ride" | "refresh_location" | "ride_update" | "generic";
  tag?: string;
  requireInteraction?: boolean;
}

// Send a push to every subscription registered for a user.
// Stale (404/410) subscriptions are cleaned up.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  configurePush();

  const supabase = await createServerSupabase();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subs?.length) return { sent: 0, removed: 0 };

  let sent = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          stale.push(sub.id);
        } else {
          console.error("Push send failed", err);
        }
      }
    })
  );

  if (stale.length) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }

  return { sent, removed: stale.length };
}
