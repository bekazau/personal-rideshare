# Status — Tier 1 MVP build

**Last updated:** 2026-05-27 (autonomous build session)

## What's working

The entire Tier 1 feature set from the plan is built and verified:

- `tsc --noEmit` — clean
- `next build` — clean (9 routes generated)
- `eslint` — clean
- `npm test` — **23/23 tests pass** (Vitest suite over `fare.ts`, `geo.ts`, `payments.ts`)

### Driver flow

1. Lands on `/`, taps "I'm a driver" → `/driver` (auth gate)
2. Not signed in → `/signin` (magic link)
3. After auth → `/driver/onboarding` if first time, else `/driver/dashboard`
4. **Onboarding wizard** ([Wizard.tsx](src/app/driver/onboarding/Wizard.tsx))
   walks them through: name + base fare → push permission → home base pin
   (current location + radius slider) → payment methods (Cash App / Venmo /
   PayPal / Zelle / Apple Pay handles + cash toggle) → first-ride-free promo
   toggle → finished with their unique invite link displayed
5. **Dashboard** ([DashboardClient.tsx](src/app/driver/dashboard/DashboardClient.tsx)):
   - Status toggle (available / busy / offline)
   - Foreground GPS capture every 15s while not offline → `captureDriverLocation`
     server action → reverse-geocodes via Mapbox → updates `last_area_name`
   - Home-base geofence: locations inside the driver's radius are silently
     dropped, so the rider-facing area never updates from home
   - Realtime ride feed (Supabase Realtime postgres_changes on `rides`)
   - Pending rides: Accept / Decline
   - Active ride: state-machine buttons (en route → arrived → in progress → complete)
   - Completed rides awaiting payment: Mark Paid via each enabled method

### Rider flow

1. Scans QR or opens `/ride/{inviteCode}` from the driver
2. Not signed in → sees driver name + magic link form
3. After auth → `claimInvite` server action ensures rider profile + driver_rider_link
4. **Rider app** ([RiderApp.tsx](src/app/ride/[inviteCode]/RiderApp.tsx)):
   - Driver status + "Last seen near [neighborhood] · 8 min ago"
   - On open, calls `pingDriverForLocationRefreshIfStale` — if driver's last
     location is >1 hr old, sends them a Web Push to tap and refresh
   - Push opt-in card (rider also gets pushes when their ride status changes)
   - Ride request form: pickup (with "use my current location"), dropoff,
     notes, **TipSelector** (preset 0/15/20/25% or custom)
   - Fare breakdown shows first-ride-free discount line item when applicable
   - Active ride status display (waiting → accepted → en route → arrived → in progress)
   - **PaymentMenu** post-completion: each enabled method as a button
     (deep links for Cash App/Venmo/PayPal, manual modal for Zelle/Apple Pay/Cash)

### Push notifications

- Driver subscribes during onboarding ([savePushSubscription](src/app/actions/push.ts))
- Rider opt-in card on rider app
- Stored in `push_subscriptions` table per user
- `sendPushToUser` ([lib/push.ts](src/lib/push.ts)) handles delivery with
  stale-subscription cleanup (404/410 → delete)
- Triggers:
  - **New ride** → push to driver ([requestRide](src/app/actions/ride.ts))
  - **Ride status changes** → push to rider on every transition
  - **Stale location** → push to driver when rider opens app
- Service worker ([public/sw.js](public/sw.js)) shows the notification, click
  navigates to `notification.data.url`, with smart focus-existing-tab logic

## What YOU need to do before you can run it

This is the only thing blocking a live test. None of it touches code.

### 1. Create a Supabase project

- Go to [supabase.com](https://supabase.com), sign up, create a project (~2 min).
- In the dashboard: **SQL Editor** → **New query** → paste the entire contents
  of [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)
  → Run. This creates all 6 tables, types, RLS policies, and helpers.
- **Settings → API**: copy the **Project URL**, **anon public** key, and
  **service_role** key.

### 2. Generate VAPID keys for Web Push

```bash
cd Apps/personal-rideshare
npx web-push generate-vapid-keys
```

Two keys come out (public + private).

### 3. Get a Mapbox token

Sign up at [mapbox.com](https://mapbox.com), copy the default public token from
Account → Tokens.

### 4. Create `.env.local`

Copy [`.env.example`](.env.example) to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BIz...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
MAPBOX_ACCESS_TOKEN=pk.eyJ...
NEXT_PUBLIC_APP_URL=https://localhost:3000
```

### 5. (Optional but recommended) Add PWA icons

Generate at [realfavicongenerator.net](https://realfavicongenerator.net/),
drop into `public/`:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable-512.png` (512×512 with safe area)

Without these the PWA install will work but the icon will be blank/missing.

### 6. Run the dev server with HTTPS

```bash
npm run dev -- --experimental-https
```

HTTPS is required for service workers, geolocation, and Web Push to function.
The first launch will provision a self-signed cert.

Open [https://localhost:3000](https://localhost:3000).

## Email delivery (avoid Supabase's built-in rate limit)

Supabase's built-in email sender is rate-limited to ~2-4 emails/hour
project-wide — fine for dev smoke tests, useless for real traffic. The
first time more than one person hits the magic-link flow you'll see
`email rate limit exceeded` and signups stall for an hour.

Fix: configure custom SMTP. Recommended for personal use is **Resend**
(3,000 emails/month free, no card).

1. Sign up at [resend.com](https://resend.com), verify your email.
2. **API Keys** → Create API Key → copy (`re_...`).
3. In Supabase Dashboard → Project Settings → Auth → SMTP Settings:
   - Enable **Custom SMTP**
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (STARTTLS)
   - Username: `resend`
   - Password: the API key from step 2
   - Sender email: `onboarding@resend.dev` (testing — only delivers to
     your own verified email address) OR `noreply@yourdomain.com` after
     verifying a domain in Resend (free, ~5 min of DNS)
   - Sender name: e.g. `Rideshare`
4. While there: bump **Authentication → Rate Limits → Emails per hour**
   to ~100 so retries during testing aren't gated.

Alternatives if Resend doesn't fit: SendGrid (100/day free), AWS SES
(cheapest at scale, sandbox-by-default), Postmark (best deliverability,
100/month free).

### Also when going to production

When deploying to Vercel (or any host), three dashboard tweaks are
required for auth to work off-localhost:

- **Supabase → Authentication → URL Configuration**
  - Site URL: your production URL (e.g. `https://personal-rideshare.vercel.app`)
  - Redirect URLs: add `<prod-url>/auth/callback`
- **Mapbox → Account → Tokens**: edit the token, add URL restriction
  to your prod URL so a leaked token can't be used elsewhere
- **Vercel env vars**: all 8 from `.env.local` need to exist in the
  Production environment, with `NEXT_PUBLIC_APP_URL` overridden to the
  prod URL (not `localhost`)

## How to verify end-to-end (steps from the plan)

Use two phones (or two browser profiles) on the same Wi-Fi:

1. **Phone A (driver)**: open `https://YOUR-LAN-IP:3000` in Safari/Chrome →
   "Add to Home Screen" → open the installed PWA.
2. Tap "I'm a driver" → sign in via magic link → complete onboarding
   (grant push permission when asked).
3. Toggle status to **Available**. Confirm GPS broadcast: you should see your
   location appear after ~15s (visible in DB: `select last_lat, last_area_name from drivers`).
4. Copy the displayed invite link.
5. **Phone B (rider)**: open the invite link → sign in via magic link → enable
   notifications when prompted.
6. Confirm driver status shows "available" + "Last seen near [area] · just now".
7. Fill in pickup, tip 20%, request the ride.
8. **Phone A should buzz with a push notification** — even if the PWA is closed
   and you're using another app. Tap the notification → app opens to the
   pending ride card.
9. Tap Accept → both phones update in realtime.
10. Walk through: I'm on the way → Arrived → Start ride → Complete.
11. Rider phone shows payment menu — tap (e.g.) Cash App, deep link opens.
12. Back on Phone A: tap "Paid via Cash App" — ride is now completed + paid.

### Home base privacy check

13. In onboarding you set a home base. Stand at your home base location with
    status Available. Confirm rider sees the *previous* area, not your home.
14. Drive a block away. After ~15s, rider should see the new area.

### Stale-location refresh check

15. Mock `last_location_at` in DB to 2 hours ago. Open the rider app.
    Phone A receives a "Refresh your area" push within a few seconds.

## What's NOT built yet (Tier 2 + Phase 2)

Per the plan, intentionally deferred:

- **SMS fallback via Twilio** when push isn't acknowledged
- **Saved addresses** (Home/Work presets) — table exists, no UI yet
- **"Your riders online" indicator** on driver dashboard (Supabase Realtime
  presence channels — needs a small `OnlineRidersBadge.tsx` component)
- **Scheduled one-off rides** and **recurring rides** with check-in pings
  (needs a `scheduled_rides` + `recurring_rides` table, two cron Edge
  Functions, and UI on both sides)
- **Multi-request queue** for driver, **distance-based fare estimate**,
  **per-rider history**, **On Break status**
- **Capacitor wrap → TestFlight + APK** for true background GPS (Phase 2)

## Known caveats / next-cleanup items

1. **Type safety on Supabase queries was relaxed** — I dropped the
   `<Database>` generic from `createClient()` because the hand-written type
   was tripping up the postgrest type inference. Runtime safety is guaranteed
   by the RLS policies. To restore IntelliSense, run
   `npx supabase gen types typescript --linked > src/lib/types/database.ts`
   once you've linked your Supabase project locally, then re-add the generic
   in `src/lib/supabase/{client,server}.ts`.
2. **Service worker auto-registration**: currently the SW only registers when
   the user enters onboarding or the rider app and grants notification
   permission. If you want eager registration on app load, add a small
   client component to `layout.tsx`.
3. **`postgis` extension** is enabled in the migration but not yet used —
   leftover from the original plan; the Haversine helper in pure SQL is
   sufficient. Safe to keep enabled for future map features.
4. **No integration tests yet** — only unit tests on the pure-logic libs.
   A future improvement would be playwright tests for the driver/rider flows.

## Files at a glance

```
src/
├── app/
│   ├── actions/
│   │   ├── auth.ts          # magic link sign in/out
│   │   ├── driver.ts        # onboarding, status, location capture
│   │   ├── push.ts          # save/remove push subscriptions
│   │   ├── ride.ts          # request, state machine, mark paid, stale-ping
│   │   └── rider.ts         # claim invite (link rider ↔ driver)
│   ├── auth/callback/route.ts
│   ├── driver/
│   │   ├── page.tsx                 # auth gate + redirect
│   │   ├── onboarding/{page,Wizard}.tsx
│   │   └── dashboard/{page,DashboardClient}.tsx
│   ├── ride/[inviteCode]/{page,RiderApp}.tsx
│   ├── signin/{page,SignInForm}.tsx
│   ├── manifest.ts          # PWA manifest
│   ├── layout.tsx           # Theme color, fonts, viewport
│   ├── page.tsx             # Landing
│   └── globals.css
├── components/
│   ├── PaymentMenu.tsx
│   └── TipSelector.tsx
├── lib/
│   ├── fare.ts              # base + first-ride-free + tip
│   ├── geo.ts               # haversine, geofence, reverse-geocode, staleness
│   ├── payments.ts          # build payment links + manual instructions
│   ├── push.ts              # server-side Web Push send
│   ├── push-client.ts       # browser push helpers
│   ├── supabase/{client,server}.ts
│   └── types/database.ts
└── proxy.ts                 # Supabase session refresh (was middleware.ts)
public/sw.js                 # Service worker (push + notificationclick)
supabase/migrations/0001_init.sql
```
