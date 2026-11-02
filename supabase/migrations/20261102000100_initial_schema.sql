-- Canonical coordinates are WGS84. Preserve source coordinates without conversion here.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.admins from public, anon, authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.admins where user_id = (select auth.uid())); $$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (length(trim(name)) > 0)
);
create table public.provinces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_zh text
);
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.provinces(id),
  name text not null,
  name_zh text,
  unique (province_id, name)
);
create table public.attractions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (length(trim(name)) > 0),
  name_zh text,
  original_name text,
  description text not null default '',
  city_id uuid references public.cities(id),
  category_id uuid references public.categories(id),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  existence_status text not null default 'unknown'
    check (existence_status in ('unknown', 'exists', 'demolished', 'relocated', 'not_found')),
  visitor_status text not null default 'unknown'
    check (visitor_status in ('unknown', 'open', 'closed', 'restricted')),
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'archived')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (publication_status <> 'published' or
    (latitude is not null and longitude is not null and existence_status = 'exists' and last_verified_at is not null))
);
create index attractions_city_idx on public.attractions(city_id);
create index attractions_category_idx on public.attractions(category_id);
create index attractions_publication_idx on public.attractions(publication_status);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  attraction_id uuid not null references public.attractions(id) on delete cascade,
  source_type text not null check (source_type in ('google', 'baidu', 'osm', 'wikidata', 'official', 'other')),
  source_url text not null check (source_url ~ '^https?://'),
  source_latitude double precision check (source_latitude between -90 and 90),
  source_longitude double precision check (source_longitude between -180 and 180),
  coordinate_system text check (coordinate_system in ('WGS84', 'GCJ02', 'BD09', 'unknown')),
  checked_at timestamptz,
  unique (attraction_id, source_url),
  check ((source_latitude is null) = (source_longitude is null)),
  check (source_latitude is null or coordinate_system is not null)
);
create table public.attraction_images (
  id uuid primary key default gen_random_uuid(),
  attraction_id uuid not null references public.attractions(id) on delete cascade,
  image_url text not null check (image_url ~ '^https?://'),
  image_type text not null check (image_type in ('replica', 'original')),
  source_url text not null check (source_url ~ '^https?://'),
  license text not null check (length(trim(license)) > 0),
  attribution text not null,
  sort_order integer not null default 0
);
create index sources_attraction_idx on public.sources(attraction_id);
create index images_attraction_idx on public.attraction_images(attraction_id);

create table public.verification_logs (
  id uuid primary key default gen_random_uuid(),
  attraction_id uuid not null references public.attractions(id) on delete cascade,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz not null default now(),
  existence_status text not null check (existence_status in ('unknown', 'exists', 'demolished', 'relocated', 'not_found')),
  visitor_status text not null check (visitor_status in ('unknown', 'open', 'closed', 'restricted')),
  evidence_urls text[] not null default '{}',
  notes text not null default ''
);
create index verification_attraction_idx on public.verification_logs(attraction_id);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('google', 'baidu', 'manual')),
  filename text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  attraction_id uuid references public.attractions(id) on delete set null,
  notes text not null default '',
  unique (batch_id, row_number)
);
create index import_items_attraction_idx on public.import_items(attraction_id);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  attraction_id uuid not null references public.attractions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, attraction_id)
);
create index favorites_attraction_idx on public.favorites(attraction_id);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function private.touch_updated_at() from public;
create trigger attractions_updated_at before update on public.attractions
for each row execute function private.touch_updated_at();

-- Explicit grants and RLS: every exposed table gets its own policies.
grant usage on schema public to anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['categories','provinces','cities','attractions','sources','attraction_images','verification_logs','import_batches','import_items','favorites'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if t <> 'favorites' then
      execute format('create policy admin_access on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    end if;
  end loop;
  foreach t in array array['categories','provinces','cities'] loop
    execute format('grant select on public.%I to anon', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
  foreach t in array array['sources','attraction_images'] loop
    execute format('grant select on public.%I to anon', t);
    execute format('create policy published_read on public.%I for select to anon, authenticated using (exists (select 1 from public.attractions a where a.id = attraction_id and a.publication_status = ''published''))', t);
  end loop;
end;
$$;
grant select on public.attractions to anon;
create policy published_read on public.attractions for select to anon, authenticated
using (publication_status = 'published');
create policy own_favorites_read on public.favorites for select to authenticated
using (user_id = (select auth.uid()));
create policy own_favorites_insert on public.favorites for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.attractions a where a.id = attraction_id and a.publication_status = 'published'
));
create policy own_favorites_delete on public.favorites for delete to authenticated
using (user_id = (select auth.uid()));
