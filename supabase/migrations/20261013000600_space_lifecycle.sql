-- A membership operation must also clear each affected account session's
-- selected space, without logging that account out of its other spaces.
-- PostgreSQL deletes the parent space before running cascades. The task guard
-- must permit that cascade even after its member has been removed/deleted.
create or replace function public.require_active_record_owner()
returns trigger language plpgsql set search_path=public as $$
declare v_member uuid; v_space uuid;
begin
 if tg_table_name='tasks' then
  if tg_op='DELETE' then
   if not exists(select 1 from public.spaces where id=old.space_id) then return old;end if;
   v_member:=old.creator_id;v_space:=old.space_id;
  else
   -- SET NULL on an imported log reference can run during the same cascade.
   if tg_op='UPDATE' and new.space_id=old.space_id and old.source_log_id is not null and new.source_log_id is null
      and not exists(select 1 from public.spaces where id=old.space_id) then return new;end if;
   v_member:=new.creator_id;v_space:=new.space_id;
  end if;
 else v_member:=new.member_id;v_space:=new.space_id;
 end if;
 perform id from public.members where id=v_member and space_id=v_space and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='record owner is no longer an active member';end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;

create or replace function public.remove_space_member(p_space_id uuid,p_actor_id uuid,p_target_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_creator uuid; v_account_id uuid;
begin
 select creator_member_id into v_creator from public.spaces where id=p_space_id for update;
 if not found or not public.is_active_member(p_space_id,p_actor_id) then
  raise exception using errcode='42501',message='not an active member';
 end if;
 if p_target_id=v_creator then raise exception using errcode='P0001',message='CREATOR_TRANSFER_REQUIRED';end if;
 if p_actor_id is distinct from p_target_id and p_actor_id is distinct from v_creator then
  raise exception using errcode='42501',message='not creator';
 end if;
 select account_id into v_account_id from public.members where id=p_target_id and space_id=p_space_id for update;
 if not found then raise exception using errcode='42501',message='invalid target';end if;
 update public.members set removed_at=coalesce(removed_at,now()) where id=p_target_id and space_id=p_space_id;
 update public.member_sessions set revoked_at=coalesce(revoked_at,now()) where member_id=p_target_id;
 update public.account_sessions set selected_space_id=null where account_id=v_account_id and selected_space_id=p_space_id;
 delete from public.conversation_members where member_id=p_target_id;
 return true;
end $$;

create or replace function public.delete_space(p_space_id uuid,p_actor_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_creator uuid;
begin
 select creator_member_id into v_creator from public.spaces where id=p_space_id for update;
 if not found or p_actor_id is distinct from v_creator then
  raise exception using errcode='42501',message='not space creator';
 end if;
 perform 1 from public.members where id=p_actor_id and space_id=p_space_id and role='creator' and removed_at is null for update;
 if not found then raise exception using errcode='42501',message='not active creator';end if;
 -- Break the spaces -> members RESTRICT reference before the members cascade.
 update public.spaces set creator_member_id=null where id=p_space_id;
 update public.account_sessions set selected_space_id=null where selected_space_id=p_space_id;
 -- Chat senders use RESTRICT, so remove conversations (and their messages)
 -- before the space cascade removes member rows.
 delete from public.conversations where space_id=p_space_id;
 delete from public.spaces where id=p_space_id;
 return true;
end $$;

revoke all on function public.remove_space_member(uuid,uuid,uuid) from public;
revoke all on function public.delete_space(uuid,uuid) from public;
grant execute on function public.remove_space_member(uuid,uuid,uuid) to service_role;
grant execute on function public.delete_space(uuid,uuid) to service_role;
