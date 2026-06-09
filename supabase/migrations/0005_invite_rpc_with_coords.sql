-- ============================================================================
-- 0005 — get_driver_by_invite returns last_lat / last_lng
-- ============================================================================
-- The rider app now renders a small map showing the driver's last-known area
-- (a fuzzy circle, not a pin), so it needs the coordinates in addition to the
-- existing reverse-geocoded area name. The home-base privacy radius in
-- captureDriverLocation already filters out coordinates inside the home zone,
-- so what's exposed here is intentionally non-sensitive.
--
-- Postgres won't let you change a function's return type with CREATE OR
-- REPLACE, so this drops and recreates. Permissions are re-granted to match
-- migration 0002.
-- ----------------------------------------------------------------------------

drop function if exists public.get_driver_by_invite(text);

create function public.get_driver_by_invite(p_invite_code text)
returns table (
  id                          uuid,
  display_name                text,
  invite_code                 text,
  status                      text,
  last_lat                    double precision,
  last_lng                    double precision,
  last_area_name              text,
  last_location_at            timestamptz,
  base_fare_cents             integer,
  first_ride_free_on          boolean,
  first_ride_discount_pct     integer,
  pay_cashapp                 text,
  pay_venmo                   text,
  pay_paypal                  text,
  pay_zelle                   text,
  pay_applepay                text,
  pay_cash_enabled            boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select id, display_name, invite_code, status,
         last_lat, last_lng, last_area_name, last_location_at,
         base_fare_cents, first_ride_free_on, first_ride_discount_pct,
         pay_cashapp, pay_venmo, pay_paypal, pay_zelle, pay_applepay,
         pay_cash_enabled
  from public.drivers
  where invite_code = p_invite_code;
$$;

revoke all on function public.get_driver_by_invite(text) from public;
grant execute on function public.get_driver_by_invite(text) to anon, authenticated;
