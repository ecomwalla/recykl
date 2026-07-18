-- book_lot(): the ONLY way quantity ever moves from "available" to
-- "reserved" and the ONLY way a booking row gets created.
--
-- The `select ... for update` below takes an exclusive lock on that one
-- stock_lots row for the rest of this transaction (a single RPC call is one
-- transaction). If two agents call book_lot() for the same lot at the same
-- instant, the second call's `for update` blocks until the first call
-- commits. Only then does the second call proceed -- and it re-reads the row
-- fresh, seeing the already-decremented quantity_available, so it correctly
-- fails if there isn't enough left. There is no gap where both calls can read
-- "1 available" and both succeed.
--
-- SECURITY DEFINER: this function runs with the privileges of the user who
-- created it (via migration), not the calling agent's -- which is what lets
-- it update quantity_available/quantity_reserved and insert into bookings
-- despite the restrictive grants set up in the previous two migrations.

create or replace function book_lot(p_lot_id uuid, p_quantity integer)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot stock_lots%rowtype;
  v_booking bookings%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_lot
  from stock_lots
  where id = p_lot_id
  for update;

  if not found then
    raise exception 'Lot not found';
  end if;

  if v_lot.status <> 'active' then
    raise exception 'Lot is not active';
  end if;

  if v_lot.quantity_available < p_quantity then
    raise exception 'Not enough quantity available (requested %, available %)',
      p_quantity, v_lot.quantity_available;
  end if;

  update stock_lots
  set quantity_available = quantity_available - p_quantity,
      quantity_reserved = quantity_reserved + p_quantity,
      status = case
        when quantity_available - p_quantity = 0 then 'depleted'
        else status
      end
  where id = p_lot_id;

  insert into bookings (agent_id, lot_id, quantity_booked, expiry_time, status)
  values (auth.uid(), p_lot_id, p_quantity, now() + interval '15 minutes', 'held')
  returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function book_lot(uuid, integer) to authenticated;
