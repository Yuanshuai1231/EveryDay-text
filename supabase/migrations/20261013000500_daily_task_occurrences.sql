-- Keep task series separate from the completion of one calendar occurrence.
alter table public.tasks
  add column recurrence text not null default 'once' check (recurrence in ('once','daily')),
  add column completed_on date,
  add column ends_on date,
  add column source_log_id uuid unique references public.daily_logs(id) on delete set null;
alter table public.tasks drop constraint tasks_notes_check;
alter table public.tasks add constraint tasks_notes_check check (
  char_length(notes)<=5000 or source_log_id is not null
);
alter table public.tasks add constraint tasks_space_id_id_unique unique(space_id,id);
alter table public.tasks add constraint tasks_occurrence_dates_check check (
  (completed_on is null or (recurrence='once' and completed and target_date is not null and completed_on>=target_date))
  and (ends_on is null or (recurrence='daily' and target_date is not null and ends_on>=target_date-1))
);
-- Anchor targetless legacy tasks before determining their completion day.
alter table public.tasks disable trigger active_task_owner;
update public.tasks t set target_date=coalesce((t.created_at at time zone s.timezone)::date,current_date)
from public.spaces s where s.id=t.space_id and t.target_date is null;
-- Existing completed tasks remain completed on their original completion day.
-- Their earlier history can consequently be read as unfinished.
update public.tasks t set completed_on=greatest(t.target_date,coalesce((t.completed_at at time zone s.timezone)::date,t.target_date))
from public.spaces s where s.id=t.space_id and t.completed and t.target_date is not null;
alter table public.tasks enable trigger active_task_owner;

-- New reminder items require a planned date; existing space data has now been backfilled.
alter table public.tasks alter column target_date set not null;

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  task_id uuid not null,
  work_date date not null,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(task_id,work_date),
  foreign key(space_id,task_id) references public.tasks(space_id,id) on delete cascade,
  check ((completed and completed_at is not null) or (not completed and completed_at is null))
);
create index task_completions_space_date_idx on public.task_completions(space_id,work_date);
alter table public.task_completions enable row level security;
revoke all on public.task_completions from anon,authenticated;
grant all on public.task_completions to service_role;
alter publication supabase_realtime add table public.task_completions;

-- BEGIN LEGACY LOG IMPORT
-- Migration-only bypass preserves records of members who have already left.
-- Original logs, including their complete content, remain untouched backups.
alter table public.tasks disable trigger active_task_owner;
insert into public.tasks(space_id,creator_id,title,notes,target_date,recurrence,completed,completed_on,completed_at,source_log_id,created_at,updated_at)
select l.space_id,l.member_id,
  left(coalesce(nullif(btrim(split_part(replace(l.content,E'\r\n',E'\n'),E'\n',1)),''),'历史记录'),120),
  l.content,l.work_date,'once',c.id is not null,
  case when c.id is not null then l.work_date end,c.checked_in_at,l.id,l.created_at,l.edited_at
from public.daily_logs l
left join public.daily_checkins c on c.space_id=l.space_id and c.member_id=l.member_id and c.work_date=l.work_date
where btrim(l.content)<>''
on conflict(source_log_id) do nothing;
alter table public.tasks enable trigger active_task_owner;
-- END LEGACY LOG IMPORT

create function public.task_occurrence_row(p_task public.tasks,p_date date)
returns jsonb language sql stable set search_path=public as $$
 select to_jsonb(p_task)||jsonb_build_object(
  'occurrence_date',p_date,
  'completed',case when p_task.recurrence='daily' then coalesce(c.completed,false) else p_task.completed and p_task.completed_on=p_date end,
  'completed_at',case when p_task.recurrence='daily' then c.completed_at when p_task.completed and p_task.completed_on=p_date then p_task.completed_at else null end,
  'overdue',p_task.recurrence='once' and p_task.target_date<p_date and not(p_task.completed and p_task.completed_on=p_date)
 ) from (select 1) seed
 left join public.task_completions c on c.task_id=p_task.id and c.work_date=p_date;
$$;

create function public.create_owned_task(p_space_id uuid,p_member_id uuid,p_title text,p_notes text,p_target_date date,p_recurrence text default 'once')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_task public.tasks;
begin
 perform id from public.members where id=p_member_id and space_id=p_space_id and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
 if p_target_date is null then raise exception using errcode='22023',message='TASK_DATE_REQUIRED';end if;
 insert into public.tasks(space_id,creator_id,title,notes,target_date,recurrence)
 values(p_space_id,p_member_id,p_title,p_notes,p_target_date,p_recurrence) returning * into v_task;
 return public.task_occurrence_row(v_task,p_target_date);
end $$;

create function public.update_owned_task(p_space_id uuid,p_member_id uuid,p_task_id uuid,p_updated_at timestamptz,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_task public.tasks;v_date date;v_now timestamptz;v_completed boolean;v_target date;v_recurrence text;
begin
 -- Membership lock precedes the task lock; removal updates this same member.
 perform id from public.members where id=p_member_id and space_id=p_space_id and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
 select * into v_task from public.tasks where id=p_task_id and space_id=p_space_id for update;
 if not found then raise exception using errcode='P0002',message='TASK_NOT_FOUND';end if;
 if v_task.creator_id<>p_member_id then raise exception using errcode='42501',message='TASK_NOT_OWNER';end if;
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
 if p_changes?'completed' then
  v_completed:=(p_changes->>'completed')::boolean;
  if v_recurrence='daily' then
   if v_task.recurrence='once' then
    -- Let the completion trigger validate the task as a daily series. The enclosing
    -- transaction makes the series conversion and first occurrence atomic.
    update public.tasks set recurrence='daily',updated_at=v_now where id=p_task_id returning * into v_task;
   end if;
   insert into public.task_completions(space_id,task_id,work_date,completed,completed_at,updated_at)
   values(p_space_id,p_task_id,v_date,v_completed,case when v_completed then v_now end,v_now)
   on conflict(task_id,work_date) do update set completed=excluded.completed,completed_at=case when excluded.completed then coalesce(task_completions.completed_at,excluded.completed_at) end,updated_at=excluded.updated_at;
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

create function public.delete_owned_task(p_space_id uuid,p_member_id uuid,p_task_id uuid,p_updated_at timestamptz,p_date date default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_task public.tasks;
begin
 perform id from public.members where id=p_member_id and space_id=p_space_id and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
 select * into v_task from public.tasks where id=p_task_id and space_id=p_space_id for update;
 if not found then raise exception using errcode='P0002',message='TASK_NOT_FOUND';end if;
 if v_task.creator_id<>p_member_id then raise exception using errcode='42501',message='TASK_NOT_OWNER';end if;
 if v_task.updated_at is distinct from p_updated_at then raise exception using errcode='40001',message='TASK_VERSION_CONFLICT';end if;
 if v_task.recurrence='daily' then
  if p_date is null then raise exception using errcode='22023',message='TASK_DATE_REQUIRED';end if;
  if p_date<v_task.target_date or (v_task.ends_on is not null and p_date>v_task.ends_on) then raise exception using errcode='22023',message='TASK_DATE_OUTSIDE_OCCURRENCE';end if;
  update public.tasks set ends_on=p_date-1,updated_at=greatest(clock_timestamp(),v_task.updated_at+interval '1 millisecond') where id=p_task_id;
 else delete from public.tasks where id=p_task_id;end if;
 return true;
end $$;

-- Completion writes also participate in membership locking, even if a future
-- service call attempts to bypass the task mutation functions.
create function public.require_active_task_completion_owner()
returns trigger language plpgsql set search_path=public as $$
declare v_task public.tasks;
begin
 select * into v_task from public.tasks where id=new.task_id and space_id=new.space_id;
 if not found or v_task.recurrence<>'daily' or new.work_date<v_task.target_date or (v_task.ends_on is not null and new.work_date>v_task.ends_on)
 then raise exception using errcode='22023',message='TASK_DATE_OUTSIDE_OCCURRENCE';end if;
 perform id from public.members where id=v_task.creator_id and space_id=v_task.space_id and removed_at is null for share;
 if not found then raise exception using errcode='42501',message='TASK_MEMBER_INACTIVE';end if;
 return new;
end $$;
create trigger active_task_completion_owner before insert or update on public.task_completions for each row execute function public.require_active_task_completion_owner();

revoke all on function public.task_occurrence_row(public.tasks,date) from public,anon,authenticated;
revoke all on function public.create_owned_task(uuid,uuid,text,text,date,text) from public,anon,authenticated;
revoke all on function public.update_owned_task(uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.delete_owned_task(uuid,uuid,uuid,timestamptz,date) from public,anon,authenticated;
grant execute on function public.task_occurrence_row(public.tasks,date) to service_role;
grant execute on function public.create_owned_task(uuid,uuid,text,text,date,text) to service_role;
grant execute on function public.update_owned_task(uuid,uuid,uuid,timestamptz,jsonb) to service_role;
grant execute on function public.delete_owned_task(uuid,uuid,uuid,timestamptz,date) to service_role;
