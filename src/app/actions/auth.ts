"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Sends an email containing both a magic link AND a 6-digit code. The PWA
// flow uses the code (verifyEmailOtp below) because the link gets opened by
// iOS Mail in Safari — a different storage partition than the home-screen
// PWA, so the PKCE verifier cookie isn't there. Desktop users can still tap
// the link and the /auth/callback route handles it.
export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const next = String(formData.get("next") || "/driver");

  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL!;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: error.message };
  return { sent: true };
}

export async function verifyEmailOtp(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const token = String(formData.get("token") || "").replace(/\D/g, "");
  const next = String(formData.get("next") || "/driver");

  if (!email || !email.includes("@")) {
    return { error: "Missing email." };
  }
  if (token.length < 6 || token.length > 10) {
    return { error: "Enter the code from your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) return { error: error.message };
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
