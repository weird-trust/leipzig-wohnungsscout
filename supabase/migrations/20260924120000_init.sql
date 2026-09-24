-- Leipzig Wohnungsscout V0.1: initial schema.
--
-- Access model: only trusted server code talks to the database, using the
-- Supabase secret key (service_role, bypasses RLS). RLS is enabled with no
-- policies and table privileges are revoked from anon/authenticated, so the
-- publishable key cannot read or write anything.
--
-- Value sets use CHECK constraints instead of enum types so they can evolve
-- with a simple constraint swap. Keep them in sync with src/lib/domain/.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- One row per inbound email. provider_message_id makes webhook redelivery a no-op.
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null,
  received_at timestamptz not null,
  raw_from text,
  raw_subject text,
  raw_text text,
  raw_html text,
  detected_source text not null,
  parser_version text,
  parse_status text not null default 'pending',
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint emails_provider_message_id_key unique (provider_message_id),
  constraint emails_detected_source_check check (
    detected_source in ('immoscout', 'immowelt', 'kleinanzeigen', 'wg-gesucht', 'lwb', 'other')
  ),
  -- 'pending': row stored, parse result not written yet.
  constraint emails_parse_status_check check (
    parse_status in ('pending', 'parsed', 'unrecognized', 'failed')
  )
);

create trigger emails_set_updated_at
  before update on public.emails
  for each row execute function public.set_updated_at();

create table public.apartments (
  id uuid primary key default gen_random_uuid(),
  -- Deleting a raw email must not delete the apartment and its status history.
  email_id uuid references public.emails (id) on delete set null,

  source text not null,
  source_url text,
  source_id text,

  title text not null,
  address text,
  district text,
  rooms numeric(3, 1),
  sqm numeric(7, 2),
  rent_cold numeric(10, 2),
  rent_warm numeric(10, 2),
  floor smallint,

  -- Tri-state: true = present, false = explicitly absent, null = unknown.
  -- No defaults on purpose.
  top_floor boolean,
  balcony boolean,
  bathtub boolean,
  residential_kitchen boolean,
  elevator boolean,
  building_type text not null default 'unknown',

  description text,
  image_url text,
  -- Informational only; duplicates are never merged on it in V0.1.
  fingerprint text,

  first_seen timestamptz not null default now(),
  status text not null default 'new',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- NULLS DISTINCT: rows without a source_id never conflict. A plain unique
  -- constraint (not a partial index) so upsert(onConflict: 'source,source_id')
  -- can target it.
  constraint apartments_source_source_id_key unique nulls distinct (source, source_id),
  constraint apartments_source_check check (
    source in ('immoscout', 'immowelt', 'kleinanzeigen', 'wg-gesucht', 'lwb', 'other')
  ),
  constraint apartments_building_type_check check (
    building_type in ('altbau', 'neubau', 'unknown')
  ),
  constraint apartments_status_check check (
    status in ('new', 'seen', 'applied', 'viewing', 'rejected', 'gone')
  ),
  constraint apartments_rooms_check check (rooms > 0),
  constraint apartments_sqm_check check (sqm > 0),
  constraint apartments_rent_cold_check check (rent_cold >= 0),
  constraint apartments_rent_warm_check check (rent_warm >= 0)
);

create index apartments_fingerprint_idx on public.apartments (fingerprint);
create index apartments_email_id_idx on public.apartments (email_id);

create trigger apartments_set_updated_at
  before update on public.apartments
  for each row execute function public.set_updated_at();

alter table public.emails enable row level security;
alter table public.apartments enable row level security;

revoke all on table public.emails from anon, authenticated;
revoke all on table public.apartments from anon, authenticated;
