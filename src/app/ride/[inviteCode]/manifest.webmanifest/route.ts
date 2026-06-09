// Per-invite rider PWA manifest. Served at /ride/[inviteCode]/manifest.webmanifest.
//
// Each driver's invite link gets its own installable PWA — distinct from the
// driver PWA — by varying start_url + scope + id. iOS keys home-screen
// installs by start_url, so two manifests with different start_urls coexist
// as separate apps.

import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ inviteCode: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { inviteCode } = await params;

  // Personalise the manifest name with the driver's display name.
  // Anon read is allowed via the SECURITY DEFINER RPC from migration 0002.
  const supabase = await createClient();
  const { data: driverRows } = await supabase.rpc("get_driver_by_invite", {
    p_invite_code: inviteCode,
  });
  const driver = Array.isArray(driverRows) ? driverRows[0] : null;
  const driverName: string =
    typeof driver?.display_name === "string" ? driver.display_name : "your driver";

  const scope = `/ride/${inviteCode}`;

  return new Response(
    JSON.stringify({
      name: `Rides with ${driverName}`,
      short_name: "Rides",
      description: `Request a ride from ${driverName}.`,
      start_url: scope,
      scope,
      id: scope,
      display: "standalone",
      background_color: "#0a0a0a",
      theme_color: "#0a0a0a",
      orientation: "portrait",
      icons: [
        { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }),
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
