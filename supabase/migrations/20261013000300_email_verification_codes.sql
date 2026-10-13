create table public.account_email_codes (
  id uuid primary key,
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  code_digest text not null check (code_digest ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  delivered_at timestamptz,
  canceled_at timestamptz,
  used_at timestamptz
);
create index account_email_codes_account_idx on public.account_email_codes(account_id,created_at desc);
alter table public.account_email_codes enable row level security;
revoke all on public.account_email_codes from anon, authenticated;
grant all on public.account_email_codes to service_role;

-- All lifecycle operations lock the account first, serializing sends and consumption.
create function public.reserve_account_email_code(p_account_id uuid, p_challenge_id uuid, p_code_digest text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_verified timestamptz; v_last timestamptz; v_retry integer;
begin
  select verified_at into v_verified from public.app_accounts where id=p_account_id and auth_provider='local' for update;
  if not found then return jsonb_build_object('status','invalid'); end if;
  if v_verified is not null then return jsonb_build_object('status','verified'); end if;
  select max(greatest(created_at,delivered_at)) into v_last from public.account_email_codes
  where account_id=p_account_id and canceled_at is null and (delivered_at is not null or expires_at>now());
  v_retry := ceil(extract(epoch from v_last + interval '60 seconds' - now()));
  if v_retry>0 then return jsonb_build_object('status','cooldown','retryAfter',v_retry); end if;
  insert into public.account_email_codes(id,account_id,code_digest) values(p_challenge_id,p_account_id,p_code_digest);
  return jsonb_build_object('status','reserved');
end;
$$;

create function public.activate_account_email_code(p_account_id uuid, p_challenge_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_code public.account_email_codes%rowtype;
begin
  perform 1 from public.app_accounts where id=p_account_id and verified_at is null and auth_provider='local' for update;
  if not found then return false; end if;
  select * into v_code from public.account_email_codes where id=p_challenge_id and account_id=p_account_id for update;
  if not found or v_code.delivered_at is not null or v_code.canceled_at is not null or v_code.used_at is not null or v_code.expires_at<=now() then return false; end if;
  -- A slow older delivery may never supersede a newer accepted email.
  if exists(select 1 from public.account_email_codes where account_id=p_account_id and delivered_at is not null and created_at>v_code.created_at) then return false; end if;
  update public.account_email_codes set used_at=now()
  where account_id=p_account_id and delivered_at is not null and used_at is null;
  update public.account_email_codes set delivered_at=now(),expires_at=now()+interval '10 minutes' where id=p_challenge_id;
  return true;
end;
$$;

create function public.cancel_account_email_code(p_account_id uuid, p_challenge_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.app_accounts where id=p_account_id for update;
  update public.account_email_codes set canceled_at=now() where id=p_challenge_id and account_id=p_account_id and delivered_at is null and canceled_at is null;
  return found;
end;
$$;

create function public.consume_account_email_code(p_account_id uuid, p_challenge_id uuid, p_code_digest text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_code public.account_email_codes%rowtype;
begin
  perform 1 from public.app_accounts where id=p_account_id and verified_at is null and auth_provider='local' for update;
  if not found then return null; end if;
  select * into v_code from public.account_email_codes
  where account_id=p_account_id and delivered_at is not null and canceled_at is null
  order by created_at desc,id desc limit 1 for update;
  if not found or v_code.id<>p_challenge_id or v_code.used_at is not null or v_code.expires_at<=now() or v_code.attempts>=5 then return null; end if;
  if v_code.code_digest<>p_code_digest then
    -- Return instead of raising: the increment must commit after an invalid code.
    update public.account_email_codes set attempts=attempts+1 where id=v_code.id;
    return null;
  end if;
  update public.account_email_codes set used_at=now() where account_id=p_account_id and used_at is null;
  update public.app_accounts set verified_at=now() where id=p_account_id;
  return p_account_id;
end;
$$;

revoke all on function public.reserve_account_email_code(uuid,uuid,text) from public;
revoke all on function public.activate_account_email_code(uuid,uuid) from public;
revoke all on function public.cancel_account_email_code(uuid,uuid) from public;
revoke all on function public.consume_account_email_code(uuid,uuid,text) from public;
grant execute on function public.reserve_account_email_code(uuid,uuid,text) to service_role;
grant execute on function public.activate_account_email_code(uuid,uuid) to service_role;
grant execute on function public.cancel_account_email_code(uuid,uuid) to service_role;
grant execute on function public.consume_account_email_code(uuid,uuid,text) to service_role;
