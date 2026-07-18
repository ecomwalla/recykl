-- Product catalog. Creating/editing products isn't a feature yet (out of
-- scope for this phase) -- rows are seeded directly by migration
-- 20260718200007_seed_products.sql so the seller page has something to pick
-- from when creating a stock lot.

create table products (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  grade text not null,
  spec text not null,
  owner_type owner_type not null,
  created_at timestamptz not null default now()
);

alter table products enable row level security;

create policy "signed-in users can view products"
  on products for select
  to authenticated
  using (true);
