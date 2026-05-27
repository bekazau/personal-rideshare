# Personal Rideshare PWA

A private, driver-controlled rideshare alternative. One driver, their personal
riders, distributed as a PWA outside the App Store. No middleman fee.

See [`../../../../.claude/plans/i-want-tomake-a-federated-ullman.md`](../../../../.claude/plans/i-want-tomake-a-federated-ullman.md)
for the full product plan, architecture, and verification steps.

---

## One-time setup

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com), create a new project.
2. In the dashboard, go to **SQL Editor** → **New query**, paste the contents
   of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
   and run it.
3. Project Settings → API → copy the **URL**, **anon public** key, and
   **service_role** key into `.env.local` (see `.env.example`).

### 2. Generate VAPID keys (for Web Push)

```bash
npx web-push generate-vapid-keys
```

Paste the public key into `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key
into `VAPID_PRIVATE_KEY` in `.env.local`.

### 3. Get a Mapbox token (for reverse-geocoding the driver's last area)

1. Sign up at [mapbox.com](https://mapbox.com).
2. Account → **Tokens** → copy the default public token.
3. Paste it into `MAPBOX_ACCESS_TOKEN` in `.env.local` (server-side only).

### 4. Add app icons

Drop the following into `public/`:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable-512.png` (512×512, with safe area for masking)

Use [realfavicongenerator.net](https://realfavicongenerator.net/) to generate
them from a single source image.

### 5. Install dependencies and run

```bash
npm install
npm run dev -- --experimental-https
```

Open [https://localhost:3000](https://localhost:3000). HTTPS is required for
geolocation, service workers, and Web Push to work — including in development.

---

## Architecture

- **Next.js 16 App Router** with TypeScript + Tailwind + React 19
- **Supabase** for Postgres, auth (magic link), realtime, and (optionally) Edge
  Functions later
- **Web Push** via the `web-push` library and a hand-written
  [`public/sw.js`](public/sw.js) service worker
- **PWA manifest** at [`src/app/manifest.ts`](src/app/manifest.ts)
- **Mapbox Geocoding API** (server-side only) for "Last seen near [neighborhood]"

### Folder layout (current)

```
src/
├── app/
│   ├── layout.tsx          # PWA-aware root layout, theme color, font
│   ├── page.tsx            # Landing / role pick
│   ├── manifest.ts         # PWA manifest (file-convention)
│   └── globals.css
├── lib/
│   ├── fare.ts             # Base + first-ride-free + tip calculator
│   ├── geo.ts              # Distance, geofence, reverse-geocode, staleness
│   ├── payments.ts         # Build payment deep-links / manual instructions
│   ├── types/database.ts   # Hand-typed Supabase Database types
│   └── supabase/
│       ├── client.ts       # Browser Supabase client
│       └── server.ts       # Server-component Supabase client
├── middleware.ts           # Supabase session refresh
public/
└── sw.js                   # Web Push handler
supabase/
└── migrations/0001_init.sql
```

### What's still to build (Tier 1)

- `/driver` (sign in / onboarding / dashboard) — covers status toggle, home base
  pin, payment methods, first-ride-free toggle, ride feed, Mark Paid
- `/ride/[inviteCode]` — rider app
- Server Actions for: subscribe to push, send "new ride" push, send "refresh
  area" push
- Location-capture client hook (foreground GPS → driver row, with home-base
  geofence filtering)
- `<PaymentMenu />`, `<TipSelector />`, `<RideRequestCard />` components

See the plan file for the full scope and verification steps.
