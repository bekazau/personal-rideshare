import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session if expired. Per @supabase/ssr docs, do not run code
  // between createServerClient and getClaims/getUser, or random logouts may occur.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and the service worker.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
