-- Core model for private spaces. The application uses an HttpOnly custom
-- member cookie, so the member token is not auth.uid(). Clients never receive
-- the service-role key. APIs must resolve the cookie to an active member and
-- perform an explicit ownership/membership check before using the server
-- service client. RLS is still enabled as a database safety boundary.

create extension if not exists pgcrypto;

create or replace function public.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from pg_timezone_names where name = p_timezone
  );
$$;

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 48),
  timezone text not null default 'Asia/Shanghai' check (public.is_valid_timezone(timezone)),
  creator_member_id uuid,
  invite_code_hash text,
  invite_revoked_at timestamptz,
  invite_rotated_at timestamptz,
  created_at timestamptz not null default now(),
  check (invite_code_hash is null or invite_code_hash ~ '^[0-9a-f]{64}$')
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 24),
  avatar_color text not null default '#F9C95E' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  role text not null default 'member' check (role in ('creator', 'member')),
  removed_at timestamptz,
  joined_at timestamptz not null default now()
);

alter table public.members
  add constraint members_space_id_unique unique (space_id, id);

-- Every resource that carries a space id must point at a member in that same
-- space. The composite key prevents a valid member from another space being
-- attached by accident.
alter table public.spaces
  add constraint spaces_creator_member_fk
  foreign key (id, creator_member_id)
  references public.members(space_id, id) on delete restrict;

create unique index members_active_nickname_unique
  on public.members (space_id, lower(trim(nickname)))
  where removed_at is null;
create index members_space_active_idx
  on public.members (space_id, removed_at);

create table public.member_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  token_digest text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index member_sessions_active_expiry_idx
  on public.member_sessions (member_id, expires_at)
  where revoked_at is null;
create index member_sessions_revoked_idx
  on public.member_sessions (revoked_at)
  where revoked_at is not null;

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  member_id uuid not null,
  work_date date not null,
  slot text not null check (slot in ('morning', 'afternoon')),
  content text not null default '',
  edited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (space_id, member_id, work_date, slot)
);

create index daily_logs_space_date_idx
  on public.daily_logs (space_id, work_date, edited_at desc);

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  member_id uuid not null,
  work_date date not null,
  checked_in_at timestamptz not null default now(),
  unique (space_id, member_id, work_date)
);

create index daily_checkins_space_date_idx
  on public.daily_checkins (space_id, work_date);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  creator_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 1000),
  target_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index tasks_space_date_idx on public.tasks (space_id, target_date, created_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  kind text not null check (kind in ('group', 'direct')),
  direct_member_low uuid,
  direct_member_high uuid,
  created_at timestamptz not null default now(),
  check (
    (kind = 'group' and direct_member_low is null and direct_member_high is null)
    or (kind = 'direct' and direct_member_low is not null and direct_member_high is not null
      and direct_member_low < direct_member_high)
  )
);

create unique index conversations_group_unique
  on public.conversations (space_id) where kind = 'group';
create unique index conversations_direct_pair_unique
  on public.conversations (space_id, direct_member_low, direct_member_high)
  where kind = 'direct';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, member_id)
);

create index conversation_members_member_idx
  on public.conversation_members (member_id, conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.members(id) on delete restrict,
  client_message_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  server_created_at timestamptz not null default now(),
  unique (conversation_id, sender_id, client_message_id)
);

create index messages_conversation_cursor_idx
  on public.messages (conversation_id, server_created_at desc, id desc);

-- Keep foreign keys from accidentally crossing spaces even when a privileged
-- server client is used. The API still performs the same checks before writes.
alter table public.daily_logs
  add constraint daily_logs_member_same_space_fk
  foreign key (space_id, member_id) references public.members(space_id, id);
alter table public.daily_checkins
  add constraint daily_checkins_member_same_space_fk
  foreign key (space_id, member_id) references public.members(space_id, id);
alter table public.tasks
  add constraint tasks_creator_same_space_fk
  foreign key (space_id, creator_id) references public.members(space_id, id);
alter table public.conversations
  add constraint conversations_low_same_space_fk
  foreign key (space_id, direct_member_low) references public.members(space_id, id);
alter table public.conversations
  add constraint conversations_high_same_space_fk
  foreign key (space_id, direct_member_high) references public.members(space_id, id);

create or replace function public.enforce_conversation_member_space()
returns trigger
language plpgsql
set search_path = public
as $$
declare conversation_space uuid; member_space uuid; conversation_kind text; low_member uuid; high_member uuid; removed_at_value timestamptz;
begin
  select space_id, kind, direct_member_low, direct_member_high
    into conversation_space, conversation_kind, low_member, high_member
    from public.conversations where id = new.conversation_id;
  select space_id, removed_at into member_space, removed_at_value from public.members where id = new.member_id;
  if conversation_space is null or member_space is null or conversation_space <> member_space or removed_at_value is not null then
    raise exception 'conversation member must belong to the same space';
  end if;
  if conversation_kind = 'direct' and new.member_id not in (low_member, high_member) then
    raise exception 'direct conversation member must be one of its two participants';
  end if;
  return new;
end;
$$;
create trigger conversation_member_same_space
before insert or update on public.conversation_members
for each row execute function public.enforce_conversation_member_space();

create or replace function public.assert_message_sender_same_space()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  conversation_space uuid;
  sender_space uuid;
begin
  select c.space_id into conversation_space
  from public.conversations c
  where c.id = new.conversation_id;
  select m.space_id into sender_space
  from public.members m
  where m.id = new.sender_id;
  if conversation_space is null or sender_space is null or conversation_space <> sender_space then
    raise exception using errcode = '23514', message = 'message sender must belong to the conversation space';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    join public.members m on m.id = cm.member_id
    where cm.conversation_id = new.conversation_id
      and cm.member_id = new.sender_id
      and m.removed_at is null
  ) then
    raise exception using errcode = '23514', message = 'message sender must belong to the conversation';
  end if;
  return new;
end;
$$;

create trigger messages_sender_same_space
before insert or update of conversation_id, sender_id on public.messages
for each row execute function public.assert_message_sender_same_space();

-- Creation and joining are single database transactions. The API generates the
-- raw invite/session values and passes only their digests to these privileged
-- functions; no secret is returned or stored in plaintext by the database.
create or replace function public.create_space_with_member(
  p_name text,
  p_nickname text,
  p_timezone text,
  p_invite_hash text,
  p_token_digest text,
  p_expires_at timestamptz
)
returns table(space_id uuid, member_id uuid, conversation_id uuid, session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_member_id uuid;
  v_conversation_id uuid;
  v_session_id uuid;
begin
  insert into public.spaces (name, timezone, invite_code_hash, invite_rotated_at)
  values (p_name, coalesce(nullif(trim(p_timezone), ''), 'Asia/Shanghai'), p_invite_hash, now())
  returning id into v_space_id;

  insert into public.members (space_id, nickname, role)
  values (v_space_id, p_nickname, 'creator')
  returning id into v_member_id;

  update public.spaces
  set creator_member_id = v_member_id
  where id = v_space_id;

  insert into public.conversations (space_id, kind)
  values (v_space_id, 'group')
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, member_id)
  values (v_conversation_id, v_member_id);

  insert into public.member_sessions (member_id, token_digest, expires_at)
  values (v_member_id, p_token_digest, p_expires_at)
  returning id into v_session_id;

  return query select v_space_id, v_member_id, v_conversation_id, v_session_id;
end;
$$;

create or replace function public.join_space_by_invite(
  p_invite_hash text,
  p_nickname text,
  p_token_digest text,
  p_expires_at timestamptz
)
returns table(space_id uuid, member_id uuid, conversation_id uuid, session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_member_id uuid;
  v_conversation_id uuid;
  v_session_id uuid;
begin
  select s.id into v_space_id
  from public.spaces s
  where s.invite_code_hash = p_invite_hash
    and s.invite_revoked_at is null
  for update;
  if v_space_id is null then
    raise exception using errcode = 'P0001', message = 'invalid invite';
  end if;

  insert into public.members (space_id, nickname, role)
  values (v_space_id, p_nickname, 'member')
  returning id into v_member_id;

  select c.id into v_conversation_id
  from public.conversations c
  where c.space_id = v_space_id and c.kind = 'group'
  for update;
  if v_conversation_id is null then
    raise exception using errcode = 'P0002', message = 'group conversation missing';
  end if;

  insert into public.conversation_members (conversation_id, member_id)
  values (v_conversation_id, v_member_id);

  insert into public.member_sessions (member_id, token_digest, expires_at)
  values (v_member_id, p_token_digest, p_expires_at)
  returning id into v_session_id;

  return query select v_space_id, v_member_id, v_conversation_id, v_session_id;
end;
$$;

revoke all on function public.create_space_with_member(text, text, text, text, text, timestamptz) from public;
revoke all on function public.join_space_by_invite(text, text, text, timestamptz) from public;
grant execute on function public.create_space_with_member(text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.join_space_by_invite(text, text, text, timestamptz) to service_role;

-- These helpers are intended for server-side authorization and diagnostics.
-- They accept an already-resolved custom-cookie member id; they do not claim
-- that Supabase auth.uid() covers this application's member sessions.
create or replace function public.is_active_member(p_space_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.space_id = p_space_id
      and m.id = p_member_id
      and m.removed_at is null
  );
$$;

create or replace function public.can_read_conversation(p_conversation_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.members m on m.id = cm.member_id
    where cm.conversation_id = p_conversation_id
      and cm.member_id = p_member_id
      and m.removed_at is null
  );
$$;

create or replace function public.can_send_message(p_conversation_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_conversation(p_conversation_id, p_member_id);
$$;

revoke all on function public.is_active_member(uuid, uuid) from public;
revoke all on function public.can_read_conversation(uuid, uuid) from public;
revoke all on function public.can_send_message(uuid, uuid) from public;
grant execute on function public.is_active_member(uuid, uuid) to service_role;
grant execute on function public.can_read_conversation(uuid, uuid) to service_role;
grant execute on function public.can_send_message(uuid, uuid) to service_role;

-- No policy below treats auth.uid() as a member id. Service-role API calls
-- bypass RLS only after explicit active-membership/ownership checks in code.
alter table public.spaces enable row level security;
alter table public.members enable row level security;
alter table public.member_sessions enable row level security;
alter table public.daily_logs enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.tasks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- The browser uses a custom member cookie rather than Supabase auth.uid().
-- Therefore direct anon/authenticated table access is explicitly denied;
-- server routes resolve the cookie, perform membership/ownership checks, then
-- use the service-role client. The service-role key is never sent to clients.
-- The browser authenticates with a custom HttpOnly member cookie, not
-- auth.uid(). Therefore anon/authenticated receive an explicit deny-all
-- policy. Server code resolves the cookie first and uses the server-only
-- service role client; service_role bypasses RLS and never reaches browsers.
create policy spaces_deny_all_custom_cookie on public.spaces
  for all to anon, authenticated using (false) with check (false);
create policy members_deny_all_custom_cookie on public.members
  for all to anon, authenticated using (false) with check (false);
create policy member_sessions_deny_all_custom_cookie on public.member_sessions
  for all to anon, authenticated using (false) with check (false);
create policy daily_logs_deny_all_custom_cookie on public.daily_logs
  for all to anon, authenticated using (false) with check (false);
create policy daily_checkins_deny_all_custom_cookie on public.daily_checkins
  for all to anon, authenticated using (false) with check (false);
create policy tasks_deny_all_custom_cookie on public.tasks
  for all to anon, authenticated using (false) with check (false);
create policy conversations_deny_all_custom_cookie on public.conversations
  for all to anon, authenticated using (false) with check (false);
create policy conversation_members_deny_all_custom_cookie on public.conversation_members
  for all to anon, authenticated using (false) with check (false);
create policy messages_deny_all_custom_cookie on public.messages
  for all to anon, authenticated using (false) with check (false);

-- Realtime channel authorization is performed by the server using the same
-- helpers. When a member is removed, the server revokes sessions, removes
-- conversation membership, and closes that member's channels.
do $$
begin
  alter publication supabase_realtime add table public.daily_logs;
  alter publication supabase_realtime add table public.daily_checkins;
  alter publication supabase_realtime add table public.tasks;
  alter publication supabase_realtime add table public.members;
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then
  null;
end
$$;
