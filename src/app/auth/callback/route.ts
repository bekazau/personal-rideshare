import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase magic-link / OAuth callback. Exchanges the `code` for a session
// cookie, then redirects to `next` (defaulting to /driver).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/driver";

  // Supabase sends error details in the query when the OTP fails (expired,
  // already used, scanner pre-fetched, etc.). Surface that instead of "missing_code".
  const errorDescription = url.searchParams.get("error_description");
  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(errorDescription)}`, url.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/signin?error=Missing+sign-in+code", url.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
