-- Self-service editor registration with owner moderation.
create table public.editor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  contact text not null check (char_length(btrim(contact)) between 2 and 150),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status <> 'pending' and reviewed_at is not null and reviewed_by is not null))
);

alter table public.editor_applications enable row level security;
revoke all on table public.editor_applications from public, anon, authenticated;

create function public.submit_editor_application(
  p_user_id uuid,
  p_email text,
  p_contact text,
  p_message text default '',
  p_website text default ''
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_contact text := btrim(p_contact);
  v_message text := btrim(coalesce(p_message,''));
begin
  -- Honeypot submissions receive a neutral success response without being stored.
  if btrim(coalesce(p_website,'')) <> '' then return true; end if;
  if char_length(v_contact) not between 2 and 150 or char_length(v_message) > 1000 then
    raise exception 'invalid_application' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id and lower(u.email) = v_email
  ) then
    raise exception 'account_required' using errcode = '22023';
  end if;
  if exists (select 1 from private.admins where user_id = p_user_id) then
    raise exception 'already_editor' using errcode = '23505';
  end if;
  insert into public.editor_applications(user_id,email,contact,message)
  values(p_user_id,v_email,v_contact,v_message)
  on conflict(user_id) do update set
    email = excluded.email,
    contact = excluded.contact,
    message = excluded.message,
    status = 'pending',
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now();
  return true;
end; $$;
revoke all on function public.submit_editor_application(uuid,text,text,text,text) from public;
grant execute on function public.submit_editor_application(uuid,text,text,text,text) to anon, authenticated;

create function public.admin_list_editor_applications()
returns table(
  id uuid,user_id uuid,email text,contact text,message text,status text,
  created_at timestamptz,reviewed_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists(select 1 from private.admins pa where pa.user_id=(select auth.uid()) and pa.role='owner') then
    raise exception 'owner_required' using errcode='42501';
  end if;
  return query
    select a.id,a.user_id,a.email,a.contact,a.message,a.status,a.created_at,a.reviewed_at
    from public.editor_applications a
    order by (a.status='pending') desc,a.created_at desc
    limit 500;
end; $$;
revoke all on function public.admin_list_editor_applications() from public, anon;
grant execute on function public.admin_list_editor_applications() to authenticated;

create function public.admin_list_editor_roles()
returns table(user_id uuid,email text,role text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists(select 1 from private.admins pa where pa.user_id=(select auth.uid()) and pa.role='owner') then
    raise exception 'owner_required' using errcode='42501';
  end if;
  return query
    select a.user_id,coalesce(u.email,''),a.role,a.created_at
    from private.admins a join auth.users u on u.id=a.user_id
    order by a.created_at;
end; $$;
revoke all on function public.admin_list_editor_roles() from public, anon;
grant execute on function public.admin_list_editor_roles() to authenticated;

create function public.admin_review_editor_application(p_id uuid,p_action text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid := (select auth.uid()); v_application public.editor_applications;
begin
  if not exists(select 1 from private.admins where user_id=v_owner and role='owner') then
    raise exception 'owner_required' using errcode='42501';
  end if;
  if p_action not in ('approve','reject') then
    raise exception 'invalid_application_action' using errcode='22023';
  end if;
  select * into v_application from public.editor_applications
    where id=p_id and status='pending' for update;
  if not found then raise exception 'application_not_pending' using errcode='22023'; end if;
  if p_action='approve' then
    insert into private.admins(user_id,role,invited_by)
    values(v_application.user_id,'editor',v_owner)
    on conflict(user_id) do update set role='editor',invited_by=v_owner;
  end if;
  update public.editor_applications set
    status=case when p_action='approve' then 'approved' else 'rejected' end,
    reviewed_by=v_owner,reviewed_at=now(),updated_at=now()
  where id=p_id;
  return true;
end; $$;
revoke all on function public.admin_review_editor_application(uuid,text) from public, anon;
grant execute on function public.admin_review_editor_application(uuid,text) to authenticated;

create function public.my_editor_application_status() returns text
language sql stable security definer set search_path = ''
as $$ select status from public.editor_applications where user_id=(select auth.uid()); $$;
revoke all on function public.my_editor_application_status() from public, anon;
grant execute on function public.my_editor_application_status() to authenticated;
