-- Caller identity remains subject to RLS; no service-role credentials in the browser.
create function public.is_editor() returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.is_admin(); $$;
revoke all on function public.is_editor() from public, anon, authenticated;
grant execute on function public.is_editor() to authenticated;

create function public.admin_save_attraction(
  p_place jsonb,
  p_sources jsonb default '[]',
  p_images jsonb default '[]',
  p_review jsonb default null,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_old public.attractions%rowtype;
  v_exists boolean;
  v_verified_at timestamptz;
  v_updated_at timestamptz;
  v_existence text := coalesce(p_place->>'existence_status', 'unknown');
  v_visitor text := coalesce(p_place->>'visitor_status', 'unknown');
  v_publication text := coalesce(p_place->>'publication_status', 'draft');
  v_item jsonb;
  v_evidence text[];
begin
  if not private.is_admin() then
    raise exception 'editor_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_place) is distinct from 'object'
    or jsonb_typeof(p_sources) is distinct from 'array'
    or jsonb_typeof(p_images) is distinct from 'array' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_sources) > 100 or jsonb_array_length(p_images) > 50 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;
  v_id := nullif(p_place->>'id', '')::uuid;
  if v_id is not null then
    select * into v_old from public.attractions where id = v_id for update;
    v_exists := found;
    if not v_exists then raise exception 'place_not_found' using errcode = 'P0002'; end if;
    if p_expected_updated_at is null or p_expected_updated_at <> v_old.updated_at then
      raise exception 'concurrent_edit' using errcode = '40001';
    end if;
    v_verified_at := v_old.last_verified_at;
  else
    v_id := gen_random_uuid();
    v_exists := false;
  end if;
  if p_review is not null then
    if jsonb_typeof(p_review) is distinct from 'object'
      or jsonb_typeof(p_review->'evidence_urls') is distinct from 'array' then
      raise exception 'review_evidence_required' using errcode = '22023';
    end if;
    select array_agg(value) into v_evidence from jsonb_array_elements_text(p_review->'evidence_urls');
    if coalesce(cardinality(v_evidence), 0) = 0
      or exists (select 1 from unnest(v_evidence) u where u !~ '^https?://[^[:space:]]+$') then
      raise exception 'review_evidence_required' using errcode = '22023';
    end if;
    v_verified_at := clock_timestamp();
  elsif (v_exists and (v_existence <> v_old.existence_status or v_visitor <> v_old.visitor_status))
    or (not v_exists and (v_existence <> 'unknown' or v_visitor <> 'unknown')) then
    raise exception 'review_required_for_status_change' using errcode = '22023';
  end if;
  if v_publication = 'published' and (
    v_existence <> 'exists' or v_verified_at is null or jsonb_array_length(p_sources) = 0
    or nullif(p_place->>'city_id', '') is null or nullif(p_place->>'category_id', '') is null
  ) then raise exception 'publication_requirements' using errcode = '22023'; end if;

  if v_exists then
    update public.attractions set
      slug = p_place->>'slug', name = p_place->>'name', name_zh = nullif(p_place->>'name_zh', ''),
      original_name = nullif(p_place->>'original_name', ''), description = coalesce(p_place->>'description', ''),
      city_id = nullif(p_place->>'city_id', '')::uuid, category_id = nullif(p_place->>'category_id', '')::uuid,
      latitude = nullif(p_place->>'latitude', '')::double precision,
      longitude = nullif(p_place->>'longitude', '')::double precision,
      existence_status = v_existence, visitor_status = v_visitor,
      publication_status = v_publication, last_verified_at = v_verified_at
    where id = v_id returning updated_at into v_updated_at;
  else
    insert into public.attractions (id, slug, name, name_zh, original_name, description, city_id, category_id,
      latitude, longitude, existence_status, visitor_status, publication_status, last_verified_at)
    values (v_id, p_place->>'slug', p_place->>'name', nullif(p_place->>'name_zh', ''),
      nullif(p_place->>'original_name', ''), coalesce(p_place->>'description', ''),
      nullif(p_place->>'city_id', '')::uuid, nullif(p_place->>'category_id', '')::uuid,
      nullif(p_place->>'latitude', '')::double precision, nullif(p_place->>'longitude', '')::double precision,
      v_existence, v_visitor, v_publication, v_verified_at)
    returning updated_at into v_updated_at;
  end if;

  -- Replace child collections in the same transaction as the place and review.
  delete from public.sources where attraction_id = v_id;
  for v_item in select value from jsonb_array_elements(p_sources) loop
    insert into public.sources (attraction_id, source_type, source_url, source_latitude, source_longitude, coordinate_system, checked_at)
    values (v_id, v_item->>'source_type', v_item->>'source_url',
      nullif(v_item->>'source_latitude', '')::double precision, nullif(v_item->>'source_longitude', '')::double precision,
      nullif(v_item->>'coordinate_system', ''), nullif(v_item->>'checked_at', '')::timestamptz);
  end loop;
  delete from public.attraction_images where attraction_id = v_id;
  for v_item in select value from jsonb_array_elements(p_images) loop
    insert into public.attraction_images (attraction_id, image_url, image_type, source_url, license, attribution, sort_order)
    values (v_id, v_item->>'image_url', v_item->>'image_type', v_item->>'source_url',
      v_item->>'license', v_item->>'attribution', coalesce((v_item->>'sort_order')::integer, 0));
  end loop;
  if p_review is not null then
    insert into public.verification_logs (attraction_id, verified_by, verified_at, existence_status, visitor_status, evidence_urls, notes)
    values (v_id, auth.uid(), v_verified_at, v_existence, v_visitor, v_evidence, coalesce(p_review->>'notes', ''));
  end if;
  return jsonb_build_object('id', v_id, 'updated_at', v_updated_at);
end;
$$;
revoke all on function public.admin_save_attraction(jsonb,jsonb,jsonb,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_save_attraction(jsonb,jsonb,jsonb,jsonb,timestamptz) to authenticated;
