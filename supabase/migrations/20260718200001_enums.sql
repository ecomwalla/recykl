-- Enumerated types shared across the marketplace schema.

create type owner_type as enum ('seller', 'house');
create type lot_status as enum ('pending_pricing', 'active', 'paused', 'depleted');
create type booking_status as enum ('held', 'confirmed', 'cancelled', 'expired');
create type user_role as enum ('agent', 'seller', 'admin');
