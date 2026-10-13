-- Preserve all existing records and imported logs as personal history.
alter table public.tasks
 add column scope text not null default 'personal' check(scope in ('personal','group')),
 add column assignee_id uuid;
alter table public.tasks add constraint tasks_scope_assignment_check check(
 (scope='personal' and assignee_id is null) or (scope='group' and assignee_id is not null)
);
alter table public.tasks add constraint tasks_assignee_same_space_fk
 foreign key(space_id,assignee_id) references public.members(space_id,id);
create index tasks_space_scope_assignee_date_idx on public.tasks(space_id,scope,assignee_id,target_date);

-- A separate task guard keeps the shared log/check-in guard unchanged.
create function public.require_active_task_owner()
returns trigger language plpgsql set search_path=public as $$
declare v_task public.tasks;v_metadata boolean;v_completion boolean;
begin
 if tg_op='DELETE' then
  if not exists(select 1 from public.spaces where id=old.space_id) then return old;end if;
  v_task:=old;
 elsif tg_op='UPDATE' then
  -- The imported log reference may be cleared during a parent-space cascade.
  if new.space_id=old.space_id and old.source_log_id is not null and new.source_log_id is null
   and not exists(select 1 from public.spaces where id=old.space_id) then return new;end if;
  if new.id is distinct from old.id or new.space_id is distinct from old.space_id
   or new.creator_id is distinct from old.creator_id or new.scope is distinct from old.scope
   or new.assignee_id is distinct from old.assignee_id
  then raise exception using errcode='22023',message='TASK_ASSIGNMENT_FIXED';end if;
  v_task:=new;
 else v_task:=new;end if;
 if v_task.scope='personal' or tg_op in ('INSERT','DELETE') then
  perform id from public.members where id=v_task.creator_id and space_id=v_task.space_id and removed_at is null for share;
  if not found then raise exception using errcode='42501',message='record owner is no longer an active member';end if;
 end if;
 if v_task.scope='group' then
  if tg_op='INSERT' then
   perform id from public.members where id=v_task.assignee_id and space_id=v_task.space_id and removed_at is null for share;
   if not found then raise exception using errcode='22023',message='TASK_ASSIGNEE_INACTIVE';end if;
  elsif tg_op='UPDATE' then
   v_metadata:=(to_jsonb(new)-array['completed','completed_on','completed_at','updated_at'])
    is distinct from (to_jsonb(old)-array['completed','completed_on','completed_at','updated_at']);
   v_completion:=new.completed is distinct from old.completed or new.completed_on is distinct from old.completed_on
    or new.completed_at is distinct from old.completed_at;
   if v_metadata then
    perform id from public.members where id=v_task.creator_id and space_id=v_task.space_id and removed_at is null for share;
    if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
   end if;
   -- Daily completion only changes the series version here; its row has a
   -- separate occurrence guard that also locks the active assignee.
   if v_completion or not v_metadata then
    perform id from public.members where id=v_task.assignee_id and space_id=v_task.space_id and removed_at is null for share;
    if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
   end if;
  end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
drop trigger active_task_owner on public.tasks;
create trigger active_task_owner before insert or update or delete on public.tasks
 for each row execute function public.require_active_task_owner();

create or replace function public.require_active_task_completion_owner()
returns trigger language plpgsql set search_path=public as $$
declare v_task public.tasks;v_member uuid;
begin
 select * into v_task from public.tasks where id=new.task_id and space_id=new.space_id;
 if not found or v_task.recurrence<>'daily' or new.work_date<v_task.target_date or (v_task.ends_on is not null and new.work_date>v_task.ends_on)
 then raise exception using errcode='22023',message='TASK_DATE_OUTSIDE_OCCURRENCE';end if;
 v_member:=case when v_task.scope='group' then v_task.assignee_id else v_task.creator_id end;
 perform id from public.members where id=v_member and space_id=v_task.space_id and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
 return new;
end $$;

-- Remove the old overload; six-position calls use the new defaults.
drop function public.create_owned_task(uuid,uuid,text,text,date,text);
create function public.create_owned_task(p_space_id uuid,p_member_id uuid,p_title text,p_notes text,p_target_date date,
 p_recurrence text default 'once',p_scope text default 'personal',p_assignee_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_task public.tasks;
begin
 perform id from public.members where id=p_member_id and space_id=p_space_id and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
 if p_target_date is null then raise exception using errcode='22023',message='TASK_DATE_REQUIRED';end if;
 if p_scope is null or p_scope not in ('personal','group')
  or (p_scope='personal' and p_assignee_id is not null) or (p_scope='group' and p_assignee_id is null)
 then raise exception using errcode='22023',message='TASK_ASSIGNMENT_INVALID';end if;
 if p_scope='group' then
  perform id from public.members where id=p_assignee_id and space_id=p_space_id and removed_at is null for share;
  if not found then raise exception using errcode='22023',message='TASK_ASSIGNEE_INACTIVE';end if;
 end if;
 insert into public.tasks(space_id,creator_id,title,notes,target_date,recurrence,scope,assignee_id)
 values(p_space_id,p_member_id,p_title,p_notes,p_target_date,p_recurrence,p_scope,p_assignee_id) returning * into v_task;
 return public.task_occurrence_row(v_task,p_target_date);
end $$;

create or replace function public.update_owned_task(p_space_id uuid,p_member_id uuid,p_task_id uuid,p_updated_at timestamptz,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_task public.tasks;v_date date;v_now timestamptz;v_completed boolean;v_target date;v_recurrence text;v_metadata boolean;
begin
 -- Membership removal and mutation lock the same member row.
 perform id from public.members where id=p_member_id and space_id=p_space_id and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
 select * into v_task from public.tasks where id=p_task_id and space_id=p_space_id for update;
 if not found then raise exception using errcode='P0002',message='TASK_NOT_FOUND';end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'object'
  or exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('title','notes','targetDate','recurrence','completed','date'))
  or not(p_changes ?| array['title','notes','targetDate','recurrence','completed'])
 then raise exception using errcode='22023',message='TASK_CHANGES_INVALID';end if;
 v_metadata:=p_changes ?| array['title','notes','targetDate','recurrence'];
 if v_task.scope='personal' then
  if v_task.creator_id<>p_member_id then raise exception using errcode='42501',message='TASK_NOT_OWNER';end if;
 else
  if v_metadata and v_task.creator_id<>p_member_id then raise exception using errcode='42501',message='TASK_NOT_OWNER';end if;
  if p_changes?'completed' and v_task.assignee_id is distinct from p_member_id then raise exception using errcode='42501',message='TASK_NOT_ASSIGNEE';end if;
 end if;
 if v_task.updated_at is distinct from p_updated_at then raise exception using errcode='40001',message='TASK_VERSION_CONFLICT';end if;
 v_date:=coalesce((p_changes->>'date')::date,v_task.target_date);
 if v_task.recurrence='daily' then
  if (p_changes?'completed') and not(p_changes?'date') then raise exception using errcode='22023',message='TASK_DATE_REQUIRED';end if;
  if ((p_changes?'targetDate') and (p_changes->>'targetDate')::date is distinct from v_task.target_date)
   or ((p_changes?'recurrence') and p_changes->>'recurrence' is distinct from v_task.recurrence)
  then raise exception using errcode='22023',message='TASK_DAILY_SCHEDULE_FIXED';end if;
 end if;
 if v_date is null or v_date<v_task.target_date or (v_task.ends_on is not null and v_date>v_task.ends_on)
  or (v_task.recurrence='once' and v_task.completed_on is not null and v_date>v_task.completed_on)
 then raise exception using errcode='22023',message='TASK_DATE_OUTSIDE_OCCURRENCE';end if;
 v_now:=greatest(clock_timestamp(),v_task.updated_at+interval '1 millisecond');
 v_target:=coalesce((p_changes->>'targetDate')::date,v_task.target_date);
 v_recurrence:=coalesce(p_changes->>'recurrence',v_task.recurrence);
 if v_task.recurrence='once' and v_recurrence='once' and p_changes?'completed' and v_task.completed
  and v_task.completed_on is distinct from v_date
 then raise exception using errcode='22023',message='TASK_COMPLETION_ON_OTHER_DATE';end if;
 if v_task.completed_on is not null and v_target>v_task.completed_on then raise exception using errcode='22023',message='TASK_DATE_AFTER_COMPLETION';end if;
 if v_task.recurrence='once' and v_recurrence='daily' and v_task.completed then raise exception using errcode='22023',message='TASK_REOPEN_BEFORE_REPEAT';end if;
 -- A metadata save with no changes performs no completion/version write.
 -- It remains valid for an active author after the assignee has left.
 if v_task.scope='group' and v_metadata and not(p_changes?'completed')
  and coalesce(p_changes->>'title',v_task.title)=v_task.title
  and coalesce(p_changes->>'notes',v_task.notes)=v_task.notes
  and v_target=v_task.target_date and v_recurrence=v_task.recurrence
 then return public.task_occurrence_row(v_task,v_date);end if;
 if p_changes?'completed' then
  v_completed:=(p_changes->>'completed')::boolean;
  if v_recurrence='daily' then
   if v_task.recurrence='once' then
    update public.tasks set recurrence='daily',updated_at=v_now where id=p_task_id returning * into v_task;
   end if;
   insert into public.task_completions(space_id,task_id,work_date,completed,completed_at,updated_at)
   values(p_space_id,p_task_id,v_date,v_completed,case when v_completed then v_now end,v_now)
   on conflict(task_id,work_date) do update set completed=excluded.completed,
    completed_at=case when excluded.completed then coalesce(task_completions.completed_at,excluded.completed_at) end,updated_at=excluded.updated_at;
  else
   v_task.completed:=v_completed;
   v_task.completed_on:=case when v_completed then v_date end;
   v_task.completed_at:=case when v_completed then coalesce(v_task.completed_at,v_now) end;
  end if;
 end if;
 update public.tasks set title=coalesce(p_changes->>'title',v_task.title),notes=coalesce(p_changes->>'notes',v_task.notes),
  target_date=v_target,recurrence=v_recurrence,completed=v_task.completed,completed_on=v_task.completed_on,completed_at=v_task.completed_at,updated_at=v_now
 where id=p_task_id returning * into v_task;
 return public.task_occurrence_row(v_task,v_date);
end $$;

-- Existing deletion/stopping RPC remains author-only with its version lock.
revoke all on function public.require_active_task_owner() from public,anon,authenticated;
revoke all on function public.create_owned_task(uuid,uuid,text,text,date,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_owned_task(uuid,uuid,text,text,date,text,text,uuid) to service_role;
