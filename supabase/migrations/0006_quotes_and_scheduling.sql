-- ============================================================================
-- 0006 — driver-quoted pricing + scheduled rides
-- ============================================================================
-- The ride flow changed:
--   * Riders request a ride WITHOUT a price (and without choosing a tip).
--   * The driver reviews the request and sends a price quote → status 'quoted'.
--   * The rider confirms the quote → status 'accepted' (existing flow resumes).
--   * Tip is chosen by the rider at payment time, not at request time.
--   * Rides can be scheduled for later via `scheduled_for` (null = "now").
--
-- The generated `total_cents` column (base_fare_cents - discount_cents +
-- tip_cents) is unchanged: base_fare_cents now holds the driver's quote (0
-- until they quote), discount_cents stays 0, and tip_cents is set at payment.
--
-- NOTE: if your SQL editor complains about adding an enum value inside a
-- transaction, run the first statement on its own, then the rest.
-- ----------------------------------------------------------------------------

alter type ride_status add value if not exists 'quoted';

-- base_fare_cents is the driver's quote, which doesn't exist at request time.
alter table public.rides alter column base_fare_cents set default 0;

-- When set, the ride is "for later"; null means "now".
alter table public.rides add column if not exists scheduled_for timestamptz;
