-- ============================================================================
-- 0002 — Anonymous invite-code lookup + Realtime publication
-- ============================================================================
-- Two fixes after first live iOS test:
--
--   1. The rider's first visit to /ride/[inviteCode] is anonymous. RLS on
--      `drivers` only allows self-read or pre-linked-rider read, so the
--      lookup returns null and the page says "Invite not found." Same wall
--      hits claimInvite once the rider signs in (they're authenticated but
--      not yet linked).
--
--      Fix: a SECURITY DEFINER function that returns only rider-safe columns
--      for a given invite_code. The invite_code (nanoid(8) lowercase) is the
--      capability — anyone who has it is meant to see this driver. We don't
--      widen the underlying RLS because writing to the table still needs
--      `id = auth.uid()`.
--
--   2. DashboardClient + RiderApp subscribe to postgres_changes on `drivers`
--      and `rides`. The supabase_realtime publication doesn't include these
--      tables by default, so subscriptions never fire — which is why the
--      driver-status buttons appear to do nothing.
-- ----------------------------------------------------------------------------

create or replace function public.get_driver_by_invite(p_invite_code text)
returns table (
  id                          uuid,
  display_name                text,
  invite_code                 text,
  status                      text,
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
  select id, display_name, invite_code, status, last_area_name,
         last_location_at, base_fare_cents, first_ride_free_on,
         first_ride_discount_pct, pay_cashapp, pay_venmo, pay_paypal,
         pay_zelle, pay_applepay, pay_cash_enabled
  from public.drivers
  where invite_code = p_invite_code;
$$;

revoke all on function public.get_driver_by_invite(text) from public;
grant execute on function public.get_driver_by_invite(text) to anon, authenticated;

-- Realtime publication — DashboardClient + RiderApp depend on these.
alter publication supabase_realtime add table public.drivers;
alter publication supabase_realtime add table public.rides;
