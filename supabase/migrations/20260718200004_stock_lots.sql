-- A stock lot is one seller's (or the house's) batch of inventory for a
-- product. It starts life as `pending_pricing` -- invisible to agents -- and
-- only becomes bookable once a seller sets a price and explicitly flips it to
-- `active`. Both of those rules are enforced here at the database level, not
-- just in application code:
--   * the CHECK constraint makes "active with no price" structurally
--     impossible to store
--   * the RLS policy below means an agent's query can never see a
--     pending_pricing row, no matter how the query is shaped
--   * the column-level GRANT means even a logged-in seller can only ever
--     UPDATE price_per_unit/status via the API -- the quantity columns can
--     only change through the book_lot() function (see migration 20260718200006)

create table stock_lots (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references auth.users (id), -- null for house-owned lots
  product_id uuid not null references products (id),
  quantity_total integer not null check (quantity_total >= 0),
  quantity_available integer not null check (quantity_available >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0),
  price_per_unit numeric(12, 2) check (price_per_unit is null or price_per_unit > 0),
  currency text not null default 'USD',
  grade text not null,
  location text not null,
  status lot_status not null default 'pending_pricing',
  uploaded_at timestamptz not null default now(),

  constraint quantities_add_up
    check (quantity_available + quantity_reserved + quantity_sold = quantity_total),

  constraint active_lots_must_have_a_price
    check (status = 'pending_pricing' or price_per_unit is not null)
);

alter table stock_lots enable row level security;

create policy "sellers can view their own lots"
  on stock_lots for select
  using (seller_id = auth.uid());

create policy "agents can view active lots"
  on stock_lots for select
  using (
    status = 'active'
    and exists (
      select 1 from profiles where id = auth.uid() and role = 'agent'
    )
  );

create policy "admins can view all lots"
  on stock_lots for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "sellers can create their own lots"
  on stock_lots for insert
  with check (seller_id = auth.uid() and status = 'pending_pricing');

create policy "sellers can update their own lots"
  on stock_lots for update
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

-- Restrict which columns the API (the `authenticated` role) may write.
-- Quantity columns are deliberately left out -- only book_lot() (SECURITY
-- DEFINER) can change them.
revoke update on stock_lots from authenticated;
grant update (price_per_unit, status) on stock_lots to authenticated;
