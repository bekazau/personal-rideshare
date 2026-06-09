// Default (driver) PWA manifest. Served at /manifest.webmanifest.
//
// This used to live in `src/app/manifest.ts` (the file-based metadata
// convention). It was moved to a route handler so the rider page can serve
// its own per-invite manifest — Next.js file-based metadata overrides
// generateMetadata, so the only way to vary the manifest per route is to
// drop the file convention and inject the <link rel="manifest"> via
// metadata.manifest in layout/page.

export const dynamic = "force-static";

export function GET() {
  return new Response(
    JSON.stringify({
      name: "Personal Rideshare",
      short_name: "Rides",
      description:
        "Private, driver-controlled rideshare. Riders book with one specific driver they trust.",
      start_url: "/",
      scope: "/",
      id: "/",
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
