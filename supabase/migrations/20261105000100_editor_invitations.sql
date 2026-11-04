-- Closed editor registration. Browser clients never write private.admins directly.
alter table private.admins
  add column role text not null default 'editor'
    check (role in ('owner','editor')),
  add column invited_by uuid references auth.users(id) on delete set null,
  add column created_at timestamptz not null default now();

-- Existing manually provisioned administrators become project owners.
update private.admins set role = 'owner';

create table public.editor_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  role text not null default 'editor' check (role = 'editor'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (not (accepted_at is not null and revoked_at is not null))
);
create unique index editor_invitations_pending_email_idx
  on public.editor_invitations (lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.editor_invitations enable row level security;
revoke all on table public.editor_invitations from public, anon, authenticated;

create function public.my_admin_role() returns text
language sql stable security definer set search_path = ''
as $$
  select role from private.admins where user_id = (select auth.uid());
$$;
revoke all on function public.my_admin_role() from public, anon, authenticated;
grant execute on function public.my_admin_role() to authenticated;

create function public.service_admin_role(p_user_id uuid) returns text
language sql stable security definer set search_path = ''
as $$ select role from private.admins where user_id = p_user_id; $$;
revoke all on function public.service_admin_role(uuid) from public, anon, authenticated;
grant execute on function public.service_admin_role(uuid) to service_role;

create function public.service_list_editor_roles()
returns table(user_id uuid, role text, invited_by uuid, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$ select a.user_id,a.role,a.invited_by,a.created_at from private.admins a order by a.created_at; $$;
revoke all on function public.service_list_editor_roles() from public, anon, authenticated;
grant execute on function public.service_list_editor_roles() to service_role;

create function public.service_create_editor_invitation(
  p_requester uuid, p_email text, p_token_hash text, p_expires_at timestamptz
) returns public.editor_invitations
language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(btrim(p_email)); v_result public.editor_invitations;
begin
  if not exists(select 1 from private.admins where user_id=p_requester and role='owner') then
    raise exception 'owner_required' using errcode='42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'invalid_invitation' using errcode='22023';
  end if;
  update public.editor_invitations set revoked_at=now()
    where lower(email)=v_email and accepted_at is null and revoked_at is null;
  insert into public.editor_invitations(email,token_hash,expires_at,created_by)
    values(v_email,p_token_hash,p_expires_at,p_requester) returning * into v_result;
  return v_result;
end; $$;
revoke all on function public.service_create_editor_invitation(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.service_create_editor_invitation(uuid,text,text,timestamptz) to service_role;

create function public.service_list_editor_invitations(p_requester uuid)
returns setof public.editor_invitations
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists(select 1 from private.admins where user_id=p_requester and role='owner') then
    raise exception 'owner_required' using errcode='42501';
  end if;
  return query select * from public.editor_invitations order by created_at desc limit 200;
end; $$;
revoke all on function public.service_list_editor_invitations(uuid) from public, anon, authenticated;
grant execute on function public.service_list_editor_invitations(uuid) to service_role;

create function public.service_revoke_editor_invitation(p_requester uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from private.admins where user_id=p_requester and role='owner') then
    raise exception 'owner_required' using errcode='42501';
  end if;
  update public.editor_invitations set revoked_at=now()
    where id=p_id and accepted_at is null and revoked_at is null;
  return found;
end; $$;
revoke all on function public.service_revoke_editor_invitation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.service_revoke_editor_invitation(uuid,uuid) to service_role;

create function public.service_get_editor_invitation(p_token_hash text)
returns table(id uuid,email text,role text,expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id,i.email,i.role,i.expires_at from public.editor_invitations i
  where i.token_hash=p_token_hash and i.accepted_at is null and i.revoked_at is null
    and i.expires_at > now();
$$;
revoke all on function public.service_get_editor_invitation(text) from public, anon, authenticated;
grant execute on function public.service_get_editor_invitation(text) to service_role;

create function public.service_accept_editor_invitation(
  p_token_hash text,p_email text,p_user_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_invitation public.editor_invitations;
begin
  select * into v_invitation from public.editor_invitations
    where token_hash=p_token_hash and email=lower(btrim(p_email))
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'invitation_invalid' using errcode='22023'; end if;
  insert into private.admins(user_id,role,invited_by)
    values(p_user_id,v_invitation.role,v_invitation.created_by)
    on conflict(user_id) do update set role=excluded.role,invited_by=excluded.invited_by;
  update public.editor_invitations set accepted_at=now() where id=v_invitation.id;
  return true;
end; $$;
revoke all on function public.service_accept_editor_invitation(text,text,uuid) from public, anon, authenticated;
grant execute on function public.service_accept_editor_invitation(text,text,uuid) to service_role;

