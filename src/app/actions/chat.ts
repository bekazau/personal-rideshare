"use server";

import { createClient } from "@/lib/supabase/server";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ?? null;
}

interface SendInput {
  driverId: string;
  riderId: string;
  body: string;
  senderRole: "driver" | "rider";
}

export async function sendMessage(input: SendInput) {
  const userId = await getUserId();
  if (!userId) return { error: "Not signed in." };

  const body = input.body.trim();
  if (!body) return { error: "Empty message." };
  if (body.length > 2000) return { error: "Message too long." };

  // Sender identity must match claimed role — RLS would also block, but fail fast.
  if (input.senderRole === "driver" && input.driverId !== userId) {
    return { error: "Forbidden." };
  }
  if (input.senderRole === "rider" && input.riderId !== userId) {
    return { error: "Forbidden." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      driver_id: input.driverId,
      rider_id: input.riderId,
      sender_role: input.senderRole,
      body,
    })
    .select("id, created_at")
    .single();

  if (error) return { error: error.message };
  return { ok: true, id: data.id, createdAt: data.created_at };
}

// Mark all of the OTHER party's unread messages as read for a given thread.
export async function markThreadRead(input: {
  driverId: string;
  riderId: string;
  readerRole: "driver" | "rider";
}) {
  const userId = await getUserId();
  if (!userId) return { ok: false };

  // The reader marks the OTHER side's messages as read.
  const otherRole = input.readerRole === "driver" ? "rider" : "driver";

  const supabase = await createClient();
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("driver_id", input.driverId)
    .eq("rider_id", input.riderId)
    .eq("sender_role", otherRole)
    .is("read_at", null);

  return { ok: true };
}
