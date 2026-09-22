-- Lock the owner row while persisting records. Removal updates the same row,
-- so a request that was authorized before removal cannot write afterwards.
create or replace function public.require_active_record_owner()
returns trigger language plpgsql set search_path=public as $$
declare v_member uuid; v_space uuid;
begin
 if tg_table_name='tasks' then
   if tg_op='DELETE' then v_member:=old.creator_id;v_space:=old.space_id;
   else v_member:=new.creator_id;v_space:=new.space_id;end if;
 else v_member:=new.member_id;v_space:=new.space_id;
 end if;
 perform id from public.members where id=v_member and space_id=v_space and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='record owner is no longer an active member';end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
create trigger active_log_owner before insert or update on public.daily_logs for each row execute function public.require_active_record_owner();
create trigger active_checkin_owner before insert or update on public.daily_checkins for each row execute function public.require_active_record_owner();
create trigger active_task_owner before insert or update or delete on public.tasks for each row execute function public.require_active_record_owner();

