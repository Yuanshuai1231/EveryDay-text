alter table public.spaces
  add column theme_id text not null default 'growth-purple'
  check (theme_id in ('growth-purple','morning-cream','mint-blue','sunset-coral'));

create or replace function public.update_account_space(
  p_space_id uuid,
  p_account_id uuid,
  p_name text,
  p_avatar_id text,
  p_theme_id text default null
)
returns table(id uuid, name text, avatar_id text, timezone text, theme_id text)
language plpgsql security definer set search_path=public as $$
declare v_member public.members%rowtype; v_space public.spaces%rowtype;
begin
 select m.* into v_member from public.members m where m.space_id=p_space_id and m.account_id=p_account_id and m.removed_at is null for update;
 if not found or v_member.role<>'creator' then raise exception using errcode='42501',message='creator required'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 48 then raise exception using errcode='22023',message='invalid space name'; end if;
 if p_theme_id is not null and p_theme_id not in ('growth-purple','morning-cream','mint-blue','sunset-coral') then raise exception using errcode='22023',message='invalid space theme'; end if;
 update public.spaces set name=trim(p_name),avatar_id=coalesce(p_avatar_id, spaces.avatar_id),theme_id=coalesce(p_theme_id, spaces.theme_id) where spaces.id=p_space_id returning spaces.* into v_space;
 return query select v_space.id,v_space.name,v_space.avatar_id,v_space.timezone,v_space.theme_id;
end $$;

revoke all on function public.update_account_space(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.update_account_space(uuid,uuid,text,text,text) to service_role;
