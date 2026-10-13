-- Repair databases that applied the earlier reminder migration before the
-- targetless legacy-task backfill order was corrected. Preserve original
-- completion timestamps, including records from authors who have since left.
alter table public.tasks disable trigger active_task_owner;
update public.tasks t
set completed_on=greatest(t.target_date,coalesce((t.completed_at at time zone s.timezone)::date,t.target_date)),
    updated_at=greatest(clock_timestamp(),t.updated_at+interval '1 millisecond')
from public.spaces s
where s.id=t.space_id and t.recurrence='once' and t.completed and t.completed_on is null;
alter table public.tasks enable trigger active_task_owner;
