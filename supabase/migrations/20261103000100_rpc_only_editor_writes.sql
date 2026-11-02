-- Catalog writes must pass through narrow, validated RPCs. Editors retain read
-- access through RLS, while personal favorites keep their owner-scoped writes.
revoke insert, update, delete on table public.categories from authenticated;
revoke insert, update, delete on table public.provinces from authenticated;
revoke insert, update, delete on table public.cities from authenticated;
revoke insert, update, delete on table public.attractions from authenticated;
revoke insert, update, delete on table public.sources from authenticated;
revoke insert, update, delete on table public.attraction_images from authenticated;
revoke insert, update, delete on table public.verification_logs from authenticated;
revoke insert, update, delete on table public.import_batches from authenticated;
revoke insert, update, delete on table public.import_items from authenticated;
revoke update on table public.favorites from authenticated;

-- SECURITY DEFINER is required after direct table grants are removed. The
-- function has an empty search path, qualifies every object and checks the
-- caller against private.admins before touching data.
alter function public.admin_save_attraction(jsonb,jsonb,jsonb,jsonb,timestamptz)
  security definer;

create function public.admin_upsert_city(
  p_province_name text,
  p_city_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_province_name text := btrim(p_province_name);
  v_city_name text := btrim(p_city_name);
  v_province_id uuid;
  v_city_id uuid;
begin
  if not private.is_admin() then
    raise exception 'editor_required' using errcode = '42501';
  end if;
  if v_province_name = '' or v_city_name = ''
    or length(v_province_name) > 200 or length(v_city_name) > 200 then
    raise exception 'invalid_city' using errcode = '22023';
  end if;

  insert into public.provinces(name)
  values (v_province_name)
  on conflict (name) do update set name = excluded.name
  returning id into v_province_id;

  insert into public.cities(province_id, name)
  values (v_province_id, v_city_name)
  on conflict (province_id, name) do update set name = excluded.name
  returning id into v_city_id;

  return v_city_id;
end;
$$;
revoke all on function public.admin_upsert_city(text,text) from public, anon, authenticated;
grant execute on function public.admin_upsert_city(text,text) to authenticated;
