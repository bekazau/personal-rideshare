-- ============================================================================
-- 0003 — Riders: last_seen_at for online/offline indicator
-- ============================================================================
-- The driver's new /driver/riders page shows a green/grey dot beside each
-- rider. "Online" = the rider's app pinged last_seen_at within the past 90s.
-- The rider app heartbeats every 30s while open; the riders list polls every
-- 15s so dots stay roughly fresh.
--
-- No RLS changes needed: the existing "driver reads linked riders" policy
-- on the riders table already covers selecting this column for the driver,
-- and "rider updates self" covers the rider writing their own row.
-- ----------------------------------------------------------------------------

alter table public.riders
  add column if not exists last_seen_at timestamptz;

create index if not exists riders_last_seen_idx on public.riders (last_seen_at desc);
