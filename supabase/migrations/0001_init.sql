-- ============================================================================
-- Personal Rideshare PWA — initial schema (Tier 1 MVP)
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- ---------------------------------------------------------------------------
-- drivers: one row per registered driver (linked 1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.drivers (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null,
  invite_code   text not null unique,                  -- short code for QR/link
  status        text not null default 'offline'
                  check (status in ('available','busy','offline')),

  -- location & home-base
  last_lat            double precision,
  last_lng            double precision,
  last_area_name      text,
  last_location_at    timestamptz,
  home_lat            double precision,
  home_lng            double precision,
  home_radius_meters  integer default 500
                        check (home_radius_meters between 100 and 5000),

  -- pricing & promos
  base_fare_cents     integer not null default 1500,
  first_ride_free_on  boolean not null default false,
  first_ride_discount_pct integer not null default 100
                        check (first_ride_discount_pct between 1 and 100),

  -- payment methods (each toggle + handle; null handle means disabled)
  pay_cashapp     text,    -- e.g. "$yourtag"
  pay_venmo       text,    -- e.g. "@handle"
  pay_paypal      text,    -- e.g. "username" for paypal.me/username
  pay_zelle       text,    -- email or phone
  pay_applepay    text,    -- email or phone for Apple Cash
  pay_cash_enabled boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index drivers_status_idx on public.drivers (status);

-- ---------------------------------------------------------------------------
-- riders: one row per registered rider (linked 1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.riders (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null,
  phone         text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- driver_rider_links: the "invite relationship" (one driver, many riders)
-- A rider may be linked to multiple drivers, but each (driver_id, rider_id)
-- pair is unique. Created when a rider opens an invite link/code.
-- ---------------------------------------------------------------------------
create table public.driver_rider_links (
  driver_id     uuid not null references public.drivers on delete cascade,
  rider_id      uuid not null references public.riders  on delete cascade,
  invited_at    timestamptz not null default now(),
  primary key (driver_id, rider_id)
);

create index driver_rider_links_rider_idx on public.driver_rider_links (rider_id);

-- ---------------------------------------------------------------------------
-- saved_addresses: rider-saved pickup/dropoff presets (Tier 2 feature; table
-- created now so we don't need a follow-up migration).
-- ---------------------------------------------------------------------------
create table public.saved_addresses (
  id            uuid primary key default gen_random_uuid(),
  rider_id      uuid not null references public.riders on delete cascade,
  label         text not null,           -- "Home", "Work", "Mom"
  address       text not null,
  lat           double precision,
  lng           double precision,
  created_at    timestamptz not null default now()
);

create index saved_addresses_rider_idx on public.saved_addresses (rider_id);

-- ---------------------------------------------------------------------------
-- rides: every requested ride, including its state machine
-- ---------------------------------------------------------------------------
create type ride_status as enum (
  'pending',       -- rider has requested, driver hasn't acted
  'accepted',      -- driver accepted, hasn't started moving yet
  'en_route',      -- driver heading to pickup
  'arrived',       -- driver at pickup
  'in_progress',   -- ride underway
  'completed',     -- ride done, payment may still be pending
  'cancelled',     -- either side cancelled
  'declined'       -- driver declined
);

create type payment_method as enum (
  'cashapp','venmo','paypal','zelle','applepay','cash','unpaid'
);

create table public.rides (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references public.drivers on delete cascade,
  rider_id          uuid not null references public.riders  on delete cascade,
  status            ride_status not null default 'pending',

  pickup_address    text not null,
  pickup_lat        double precision,
  pickup_lng        double precision,
  dropoff_address   text,
  dropoff_lat       double precision,
  dropoff_lng       double precision,
  rider_notes       text,

  -- fare breakdown (cents)
  base_fare_cents     integer not null,
  discount_cents      integer not null default 0,
  tip_cents           integer not null default 0,
  total_cents         integer generated always as
                        (greatest(base_fare_cents - discount_cents, 0) + tip_cents) stored,
  is_first_ride       boolean not null default false,

  -- payment
  payment_method    payment_method not null default 'unpaid',
  paid_at           timestamptz,

  requested_at      timestamptz not null default now(),
  accepted_at       timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz
);

create index rides_driver_status_idx on public.rides (driver_id, status);
create index rides_rider_idx        on public.rides (rider_id, requested_at desc);

-- ---------------------------------------------------------------------------
-- push_subscriptions: Web Push endpoints per user (driver or rider)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table public.drivers              enable row level security;
alter table public.riders               enable row level security;
alter table public.driver_rider_links   enable row level security;
alter table public.saved_addresses      enable row level security;
alter table public.rides                enable row level security;
alter table public.push_subscriptions   enable row level security;

-- drivers: a driver can read/update their own row.
-- A rider linked to a driver can read that driver's public-ish fields
-- (we filter columns at the API layer; RLS allows row access).
create policy "driver reads self"    on public.drivers
  for select using (id = auth.uid());
create policy "driver updates self"  on public.drivers
  for update using (id = auth.uid());
create policy "driver inserts self"  on public.drivers
  for insert with check (id = auth.uid());
create policy "linked riders read driver" on public.drivers
  for select using (
    exists (
      select 1 from public.driver_rider_links l
      where l.driver_id = drivers.id and l.rider_id = auth.uid()
    )
  );

-- riders: a rider can read/update their own row. A driver can read riders
-- that are linked to them.
create policy "rider reads self"    on public.riders
  for select using (id = auth.uid());
create policy "rider updates self"  on public.riders
  for update using (id = auth.uid());
create policy "rider inserts self"  on public.riders
  for insert with check (id = auth.uid());
create policy "driver reads linked riders" on public.riders
  for select using (
    exists (
      select 1 from public.driver_rider_links l
      where l.rider_id = riders.id and l.driver_id = auth.uid()
    )
  );

-- driver_rider_links: either party in the link can read it. Either party can
-- create it (the rider creates it when scanning an invite; the driver may
-- be allowed to manually invite — kept open here for both).
create policy "link readable by either party" on public.driver_rider_links
  for select using (driver_id = auth.uid() or rider_id = auth.uid());
create policy "link insert by either party"   on public.driver_rider_links
  for insert with check (driver_id = auth.uid() or rider_id = auth.uid());

-- saved_addresses: only the owning rider.
create policy "saved addr by owner" on public.saved_addresses
  for all using (rider_id = auth.uid())
  with check (rider_id = auth.uid());

-- rides: driver and rider on the ride can read it. Riders create their own
-- pending rides; drivers update status on rides they own.
create policy "ride readable by parties" on public.rides
  for select using (driver_id = auth.uid() or rider_id = auth.uid());
create policy "rider creates ride" on public.rides
  for insert with check (
    rider_id = auth.uid()
    and exists (
      select 1 from public.driver_rider_links l
      where l.driver_id = rides.driver_id and l.rider_id = auth.uid()
    )
  );
create policy "driver updates own ride" on public.rides
  for update using (driver_id = auth.uid());
create policy "rider cancels own ride" on public.rides
  for update using (rider_id = auth.uid() and status in ('pending','accepted'));

-- push_subscriptions: only owner can read/modify their subs.
create policy "push subs by owner" on public.push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- Helpers
-- ===========================================================================

-- Generate a short, URL-safe invite code for a new driver.
create or replace function public.generate_invite_code()
returns text language sql as $$
  select lower(substr(replace(encode(gen_random_bytes(6), 'base64'),'/','_'), 1, 8));
$$;

-- Distance between two GPS points, in meters. Used for home-base geofence.
create or replace function public.meters_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select
    case when lat1 is null or lat2 is null then null
    else
      6371000.0 * 2 * asin(
        sqrt(
          power(sin(radians((lat2 - lat1) / 2)), 2) +
          cos(radians(lat1)) * cos(radians(lat2)) *
          power(sin(radians((lng2 - lng1) / 2)), 2)
        )
      )
    end;
$$;

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger drivers_touch_updated
  before update on public.drivers
  for each row execute function public.touch_updated_at();
