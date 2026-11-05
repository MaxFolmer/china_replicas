-- Supabase auth.users.email is varchar; expose a stable text result to clients.
create or replace function public.admin_list_editor_roles()
returns table(user_id uuid,email text,role text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists(select 1 from private.admins pa where pa.user_id=(select auth.uid()) and pa.role='owner') then
    raise exception 'owner_required' using errcode='42501';
  end if;
  return query
    select a.user_id,coalesce(u.email,'')::text,a.role::text,a.created_at
    from private.admins a join auth.users u on u.id=a.user_id
    order by a.created_at;
end; $$;
revoke all on function public.admin_list_editor_roles() from public, anon;
grant execute on function public.admin_list_editor_roles() to authenticated;
