-- ============================================================================
-- 0004 — Messages: persistent driver↔rider chat threads
-- ============================================================================
-- One persistent thread per (driver_id, rider_id) pair — not per-ride. Either
-- party can read and write to threads they're a member of. Realtime is enabled
-- so messages arrive instantly; the client also polls as a fallback (iOS PWA
-- WebSocket can suspend in background).
-- ----------------------------------------------------------------------------

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references public.drivers on delete cascade,
  rider_id     uuid not null references public.riders  on delete cascade,
  sender_role  text not null check (sender_role in ('driver','rider')),
  body         text not null check (length(body) > 0 and length(body) <= 2000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

create index if not exists messages_thread_idx
  on public.messages (driver_id, rider_id, created_at);

alter table public.messages enable row level security;

-- Read: either side of the thread can see all messages in it.
create policy "driver reads thread" on public.messages
  for select using (driver_id = auth.uid());

create policy "rider reads thread" on public.messages
  for select using (rider_id = auth.uid());

-- Write: must be a real party of the link, and sender_role must match identity.
create policy "driver writes thread" on public.messages
  for insert with check (
    driver_id = auth.uid()
    and sender_role = 'driver'
    and exists (
      select 1 from public.driver_rider_links l
      where l.driver_id = messages.driver_id
        and l.rider_id  = messages.rider_id
    )
  );

create policy "rider writes thread" on public.messages
  for insert with check (
    rider_id = auth.uid()
    and sender_role = 'rider'
    and exists (
      select 1 from public.driver_rider_links l
      where l.driver_id = messages.driver_id
        and l.rider_id  = messages.rider_id
    )
  );

-- Mark-as-read: each side can only mark the OTHER side's messages as read.
create policy "driver marks rider messages read" on public.messages
  for update using (driver_id = auth.uid() and sender_role = 'rider');

create policy "rider marks driver messages read" on public.messages
  for update using (rider_id = auth.uid() and sender_role = 'driver');

alter publication supabase_realtime add table public.messages;
