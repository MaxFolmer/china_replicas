create function public.admin_review_import_item(
  p_item_id uuid,
  p_action text,
  p_attraction_id uuid default null,
  p_notes text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.import_items%rowtype;
  v_source text;
  v_name text;
  v_url text;
  v_lat double precision;
  v_lon double precision;
  v_attraction_id uuid;
begin
  if not private.is_admin() then raise exception 'editor_required' using errcode='42501'; end if;
  if p_action not in ('create','link','reject') or length(coalesce(p_notes,'')) > 2000 then
    raise exception 'invalid_import_action' using errcode='22023';
  end if;

  select * into v_item from public.import_items where id=p_item_id for update;
  if not found then raise exception 'import_item_not_found' using errcode='P0002'; end if;
  if v_item.review_status <> 'pending' then raise exception 'import_item_reviewed' using errcode='22023'; end if;
  select source into v_source from public.import_batches where id=v_item.batch_id;

  if p_action='reject' then
    update public.import_items set review_status='rejected',notes=coalesce(p_notes,'') where id=p_item_id;
    return jsonb_build_object('action','rejected','attraction_id',null);
  end if;

  if p_action='link' then
    if p_attraction_id is null or not exists(select 1 from public.attractions where id=p_attraction_id) then
      raise exception 'attraction_required' using errcode='22023';
    end if;
    v_attraction_id:=p_attraction_id;
  else
    v_name:=btrim(v_item.raw_data#>>'{_import,name}');
    if coalesce(v_name,'')='' or length(v_name)>200 then raise exception 'invalid_import_name' using errcode='22023'; end if;
    v_attraction_id:=gen_random_uuid();
    insert into public.attractions(id,slug,name,publication_status)
    values(v_attraction_id,'import-'||left(replace(v_attraction_id::text,'-',''),16),v_name,'draft');

    v_url:=nullif(v_item.raw_data#>>'{_import,source_url}','');
    begin v_lat:=(v_item.raw_data#>>'{_import,latitude}')::double precision; exception when others then v_lat:=null; end;
    begin v_lon:=(v_item.raw_data#>>'{_import,longitude}')::double precision; exception when others then v_lon:=null; end;
    if v_lat not between -90 and 90 or v_lon not between -180 and 180 then v_lat:=null;v_lon:=null; end if;
    if v_url ~ '^https?://[^[:space:]]+$' then
      insert into public.sources(attraction_id,source_type,source_url,source_latitude,source_longitude,coordinate_system)
      values(v_attraction_id,case when v_source in ('google','baidu') then v_source else 'other' end,v_url,v_lat,v_lon,case when v_lat is null then null else 'unknown' end);
    end if;
  end if;

  update public.import_items set review_status='approved',attraction_id=v_attraction_id,notes=coalesce(p_notes,'') where id=p_item_id;
  return jsonb_build_object('action',p_action,'attraction_id',v_attraction_id);
end;
$$;
revoke all on function public.admin_review_import_item(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_review_import_item(uuid,text,uuid,text) to authenticated;
