-- A booking is an agent reserving quantity from a stock lot. Rows are only
-- ever created by the book_lot() function (see the next migration) -- there
-- is deliberately no INSERT grant for the `authenticated` role here, so
-- there's no direct API call that can create a booking while skipping the
-- row-locking logic in book_lot().

create table bookings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users (id),
  lot_id uuid not null references stock_lots (id),
  quantity_booked integer not null check (quantity_booked > 0),
  booked_at timestamptz not null default now(),
  expiry_time timestamptz,
  status booking_status not null default 'held'
);

alter table bookings enable row level security;

create policy "agents can view their own bookings"
  on bookings for select
  using (agent_id = auth.uid());
