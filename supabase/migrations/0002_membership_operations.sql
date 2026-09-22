create unique index if not exists spaces_invite_hash_unique on public.spaces(invite_code_hash) where invite_code_hash is not null;

create or replace function public.remove_space_member(p_space_id uuid,p_actor_id uuid,p_target_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_creator uuid;
begin
 select creator_member_id into v_creator from spaces where id=p_space_id for update;
 if not public.is_active_member(p_space_id,p_actor_id) then raise exception using errcode='42501',message='not an active member'; end if;
 if p_target_id=v_creator then raise exception using errcode='P0001',message='CREATOR_TRANSFER_REQUIRED';end if;
 if p_actor_id<>p_target_id and p_actor_id<>v_creator then raise exception using errcode='42501',message='not creator';end if;
 if not exists(select 1 from members where id=p_target_id and space_id=p_space_id) then raise exception using errcode='42501',message='invalid target';end if;
 update members set removed_at=coalesce(removed_at,now()) where id=p_target_id and space_id=p_space_id;
 update member_sessions set revoked_at=coalesce(revoked_at,now()) where member_id=p_target_id;
 delete from conversation_members where member_id=p_target_id;
 return true;
end $$;
create or replace function public.transfer_space_owner(p_space_id uuid,p_actor_id uuid,p_target_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_creator uuid;
begin
 select creator_member_id into v_creator from spaces where id=p_space_id for update;
 if p_actor_id is distinct from v_creator or not public.is_active_member(p_space_id,p_actor_id) then raise exception using errcode='42501',message='not creator';end if;
 if not public.is_active_member(p_space_id,p_target_id) or p_actor_id=p_target_id then raise exception using errcode='22023',message='invalid successor';end if;
 update members set role='member' where id=p_actor_id;
 update members set role='creator' where id=p_target_id;
 update spaces set creator_member_id=p_target_id where id=p_space_id;
 return true;
end $$;
revoke all on function public.remove_space_member(uuid,uuid,uuid) from public;
revoke all on function public.transfer_space_owner(uuid,uuid,uuid) from public;
grant execute on function public.remove_space_member(uuid,uuid,uuid) to service_role;
grant execute on function public.transfer_space_owner(uuid,uuid,uuid) to service_role;

