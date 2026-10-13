create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nickname text not null check (char_length(trim(nickname)) between 1 and 24),
  avatar_id text,
  auth_provider text not null default 'local' check (auth_provider in ('local','supabase')),
  password_hash text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists app_accounts_email_unique on public.app_accounts (lower(trim(email)));
alter table public.app_accounts enable row level security;

create table if not exists public.account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  token_digest text not null unique,
  selected_space_id uuid,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists account_sessions_active_idx on public.account_sessions(account_id, expires_at) where revoked_at is null;
alter table public.account_sessions enable row level security;

create table if not exists public.account_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  token_digest text not null unique,
  purpose text not null check (purpose in ('verify','reset')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists account_tokens_active_idx on public.account_tokens(account_id, purpose, expires_at) where used_at is null;
alter table public.account_tokens enable row level security;
grant all on public.app_accounts, public.account_sessions, public.account_tokens to service_role;

alter table public.members add column if not exists account_id uuid references public.app_accounts(id) on delete set null;
create unique index if not exists members_account_space_unique on public.members(account_id, space_id) where account_id is not null;
create index if not exists members_account_idx on public.members(account_id) where account_id is not null;

create or replace function public.claim_legacy_membership(p_account_id uuid, p_member_id uuid, p_legacy_session_id uuid, p_account_session_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_member public.members%rowtype;
begin
  perform 1 from public.app_accounts where id=p_account_id and verified_at is not null for update;
  if not found then raise exception 'verified account required'; end if;
  perform 1 from public.account_sessions where id=p_account_session_id and account_id=p_account_id and revoked_at is null and expires_at>now() for update;
  if not found then
    raise exception 'account session required';
  end if;
  perform 1 from public.member_sessions where id=p_legacy_session_id and member_id=p_member_id and revoked_at is null and expires_at>now() for update;
  if not found then
    raise exception 'legacy session required';
  end if;
  select * into v_member from public.members where id=p_member_id for update;
  if not found or v_member.removed_at is not null then raise exception 'active membership required'; end if;
  if v_member.account_id is not null and v_member.account_id<>p_account_id then
    raise exception 'membership already linked';
  end if;
  update public.members set account_id=p_account_id where id=p_member_id and account_id is null;
  update public.member_sessions set revoked_at=coalesce(revoked_at,now()) where member_id=p_member_id;
  return true;
end;
$$;
revoke all on function public.claim_legacy_membership(uuid,uuid,uuid,uuid) from public;
grant execute on function public.claim_legacy_membership(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.complete_account_password_reset(p_token_digest text, p_password_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_account_id uuid; v_provider text;
begin
  select t.account_id, a.auth_provider into v_account_id, v_provider
  from public.account_tokens t join public.app_accounts a on a.id=t.account_id
  where t.token_digest=p_token_digest and t.purpose='reset' and t.used_at is null and t.expires_at>now()
  for update of t, a;
  if v_account_id is null then return null; end if;
  update public.account_tokens set used_at=now() where token_digest=p_token_digest and used_at is null;
  if v_provider='local' then
    update public.app_accounts set password_hash=p_password_hash, verified_at=coalesce(verified_at,now()) where id=v_account_id;
  end if;
  update public.account_sessions set revoked_at=coalesce(revoked_at,now()) where account_id=v_account_id;
  update public.member_sessions s set revoked_at=coalesce(s.revoked_at,now())
  from public.members m where s.member_id=m.id and m.account_id=v_account_id;
  return v_account_id;
end;
$$;
revoke all on function public.complete_account_password_reset(text,text) from public;
grant execute on function public.complete_account_password_reset(text,text) to service_role;

create or replace function public.complete_account_email_verification(p_token_digest text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_account_id uuid;
begin
  select t.account_id into v_account_id from public.account_tokens t
  where t.token_digest=p_token_digest and t.purpose='verify' and t.used_at is null and t.expires_at>now()
  for update;
  if v_account_id is null then return null; end if;
  update public.account_tokens set used_at=now() where token_digest=p_token_digest;
  update public.app_accounts set verified_at=coalesce(verified_at,now()) where id=v_account_id;
  return v_account_id;
end;
$$;
revoke all on function public.complete_account_email_verification(text) from public;
grant execute on function public.complete_account_email_verification(text) to service_role;
