create function public.admin_create_import_batch(
  p_source text,
  p_filename text,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch_id uuid;
begin
  if not private.is_admin() then
    raise exception 'editor_required' using errcode = '42501';
  end if;
  if p_source not in ('google','baidu','manual')
    or length(btrim(p_filename)) not between 1 and 255
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 5000
    or exists (select 1 from jsonb_array_elements(p_items) item where jsonb_typeof(item) is distinct from 'object') then
    raise exception 'invalid_import' using errcode = '22023';
  end if;

  insert into public.import_batches(source,filename,created_by)
  values (p_source,btrim(p_filename),auth.uid()) returning id into v_batch_id;

  insert into public.import_items(batch_id,row_number,raw_data)
  select v_batch_id,ordinality,value
  from jsonb_array_elements(p_items) with ordinality;

  return v_batch_id;
end;
$$;
revoke all on function public.admin_create_import_batch(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_create_import_batch(text,text,jsonb) to authenticated;
