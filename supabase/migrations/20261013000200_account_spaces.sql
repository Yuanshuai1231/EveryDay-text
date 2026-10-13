alter table public.spaces add column if not exists avatar_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.app_accounts'::regclass and conname='app_accounts_avatar_id_supported') then
    alter table public.app_accounts add constraint app_accounts_avatar_id_supported check (avatar_id is null or avatar_id in ('cat','rabbit','dog','fox','bear','panda','koala','frog','pig','penguin','lion','raccoon'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.spaces'::regclass
      and conname = 'spaces_avatar_id_supported'
  ) then
    alter table public.spaces add constraint spaces_avatar_id_supported
      check (avatar_id is null or avatar_id in (
        'cat', 'rabbit', 'dog', 'fox', 'bear', 'panda',
        'koala', 'frog', 'pig', 'penguin', 'lion', 'raccoon'
      ));
  end if;
end
$$;

create or replace function public.create_account_space(
  p_account_id uuid,
  p_name text,
  p_nickname text,
  p_timezone text,
  p_invite_hash text,
  p_avatar_id text
)
returns table(space_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts%rowtype;
  v_space_id uuid;
  v_member_id uuid;
  v_conversation_id uuid;
begin
  select * into v_account from public.app_accounts where id = p_account_id for update;
  if not found or v_account.verified_at is null then
    raise exception using errcode = '42501', message = 'verified account required';
  end if;
  if p_nickname is distinct from v_account.nickname then
    raise exception using errcode = '42501', message = 'account nickname mismatch';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 48 then
    raise exception using errcode = '22023', message = 'invalid space name';
  end if;
  if not public.is_valid_timezone(coalesce(nullif(trim(p_timezone), ''), 'Asia/Shanghai')) then
    raise exception using errcode = '22023', message = 'invalid timezone';
  end if;
  if p_invite_hash is null or p_invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid invite hash';
  end if;

  insert into public.spaces(name, timezone, invite_code_hash, invite_rotated_at, avatar_id)
  values(trim(p_name), coalesce(nullif(trim(p_timezone), ''), 'Asia/Shanghai'), p_invite_hash, now(), p_avatar_id)
  returning id into v_space_id;

  insert into public.members(space_id, nickname, role, account_id)
  values(v_space_id, v_account.nickname, 'creator', v_account.id)
  returning id into v_member_id;

  update public.spaces set creator_member_id = v_member_id where id = v_space_id;
  insert into public.conversations(space_id, kind) values(v_space_id, 'group') returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id, member_id) values(v_conversation_id, v_member_id);
  return query select v_space_id, v_member_id;
end;
$$;

create or replace function public.join_account_space(
  p_account_id uuid,
  p_invite_hash text,
  p_nickname text
)
returns table(space_id uuid, member_id uuid, joined boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.app_accounts%rowtype;
  v_space_id uuid;
  v_member_id uuid;
  v_conversation_id uuid;
  v_member public.members%rowtype;
  v_nickname text;
begin
  select * into v_account from public.app_accounts where id = p_account_id for update;
  if not found or v_account.verified_at is null then
    raise exception using errcode = '42501', message = 'verified account required';
  end if;
  select s.id into v_space_id from public.spaces s
  where s.invite_code_hash = p_invite_hash and s.invite_revoked_at is null
  for update;
  if v_space_id is null then
    raise exception using errcode = 'P0001', message = 'invalid invite';
  end if;

  select * into v_member from public.members m
  where m.account_id = v_account.id and m.space_id = v_space_id
  for update;
  if found and v_member.removed_at is null then
    return query select v_space_id, v_member.id, false;
    return;
  end if;

  v_nickname := coalesce(nullif(trim(p_nickname), ''), v_account.nickname);
  if char_length(v_nickname) not between 1 and 24 then
    raise exception using errcode = '22023', message = 'invalid nickname';
  end if;

  if found then
    update public.members set nickname = v_nickname, role = 'member', removed_at = null
    where id = v_member.id returning id into v_member_id;
  else
    insert into public.members(space_id, nickname, role, account_id)
    values(v_space_id, v_nickname, 'member', v_account.id)
    returning id into v_member_id;
  end if;

  select c.id into v_conversation_id from public.conversations c
  where c.space_id = v_space_id and c.kind = 'group' for update;
  if v_conversation_id is null then
    raise exception using errcode = 'P0002', message = 'group conversation missing';
  end if;
  insert into public.conversation_members(conversation_id, member_id)
  values(v_conversation_id, v_member_id) on conflict on constraint conversation_members_pkey do nothing;
  return query select v_space_id, v_member_id, true;
end;
$$;

create or replace function public.update_account_space(
  p_space_id uuid,
  p_account_id uuid,
  p_name text,
  p_avatar_id text
)
returns setof public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_member_id uuid;
begin
  if p_name is null or char_length(trim(p_name)) not between 1 and 48 then
    raise exception using errcode = '22023', message = 'invalid space name';
  end if;
  select s.creator_member_id into v_creator_member_id
  from public.spaces s where s.id = p_space_id for update;
  if not found or not exists (
    select 1 from public.members m
    where m.id = v_creator_member_id and m.space_id = p_space_id
      and m.account_id = p_account_id and m.role = 'creator' and m.removed_at is null
  ) then
    raise exception using errcode = '42501', message = 'not space creator';
  end if;
  return query update public.spaces s set name = trim(p_name), avatar_id = coalesce(p_avatar_id, s.avatar_id)
  where s.id = p_space_id returning s.*;
end;
$$;

revoke all on function public.create_account_space(uuid, text, text, text, text, text) from public;
revoke all on function public.join_account_space(uuid, text, text) from public;
revoke all on function public.update_account_space(uuid, uuid, text, text) from public;
grant execute on function public.create_account_space(uuid, text, text, text, text, text) to service_role;
grant execute on function public.join_account_space(uuid, text, text) to service_role;
grant execute on function public.update_account_space(uuid, uuid, text, text) to service_role;
