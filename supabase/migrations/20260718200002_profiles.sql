-- One row per signed-in user, recording which side of the marketplace they're
-- on. Row Level Security policies elsewhere check this table to decide what
-- an agent vs. a seller vs. an admin is allowed to see.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users can view their own profile"
  on profiles for select
  using (id = auth.uid());
