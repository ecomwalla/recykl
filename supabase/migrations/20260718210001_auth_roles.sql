-- Completes the three-role auth story:
--   1. new signups automatically get a profiles row, with the role decided
--      HERE in the database -- a hand-crafted API call asking for 'admin'
--      gets 'agent' instead. Admin accounts can only be provisioned
--      server-side (service role / seed script).
--   2. sellers can see bookings ("orders") placed against their own lots
--   3. admins can see all bookings and all profiles
--      (stock_lots already has its admin policy from the previous migration)

-- 0. Role-lookup helper ------------------------------------------------------
-- SECURITY DEFINER so it reads profiles without re-triggering RLS. Required
-- for the admin policy on profiles itself (a policy on profiles that queried
-- profiles directly would recurse infinitely), and reusable everywhere else
-- a policy needs "what role am I".

create or replace function current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- 1. Signup trigger ---------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  -- Only honor the two self-service roles. Anything else -- 'admin', a typo,
  -- or a forged metadata payload -- silently becomes 'agent'.
  case new.raw_user_meta_data ->> 'role'
    when 'seller' then v_role := 'seller';
    when 'agent' then v_role := 'agent';
    else v_role := 'agent';
  end case;

  insert into profiles (id, role)
  values (new.id, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2. Sellers see orders on their lots ---------------------------------------

create policy "sellers can view bookings on their lots"
  on bookings for select
  using (
    exists (
      select 1 from stock_lots
      where stock_lots.id = bookings.lot_id
        and stock_lots.seller_id = auth.uid()
    )
  );

-- 3. Admin sees everything ---------------------------------------------------

create policy "admins can view all bookings"
  on bookings for select
  using (current_user_role() = 'admin');

create policy "admins can view all profiles"
  on profiles for select
  using (current_user_role() = 'admin');
