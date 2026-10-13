-- 在目标 Supabase 项目的 SQL Editor 中完整运行。
-- 只读：仅检查数据库元数据；不读取业务记录、邀请码、会话摘要或密钥。
-- 清单来源：lib/supabase/types.ts、app/api、lib/data 与 migrations/0001-0004。
begin transaction read only;

-- 1. 当前数据库与 service_role。TimeZone 是会话时区，不代表机房所在区域。
select
  current_database() as database_name,
  current_schema() as schema_name,
  current_user as sql_editor_role,
  current_setting('TimeZone') as session_timezone,
  r.oid is not null as service_role_exists,
  coalesce(r.rolbypassrls or r.rolsuper, false) as service_role_bypasses_rls,
  coalesce(has_schema_privilege(r.oid, 'public', 'USAGE'), false) as service_role_public_usage
from (values ('service_role')) as expected(role_name)
left join pg_roles r on r.rolname = expected.role_name;

-- 2. 全部 9 张业务表及服务端访问权限。表缺失时返回 false，不会报 relation 不存在。
with expected(table_name) as (values
  ('spaces'), ('members'), ('member_sessions'), ('daily_logs'),
  ('daily_checkins'), ('tasks'), ('conversations'), ('conversation_members'), ('messages')
), objects as (
  select table_name, to_regclass('public.' || table_name) as relation_oid
  from expected
)
select
  o.table_name,
  coalesce(c.relkind in ('r', 'p'), false) as table_exists,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(has_table_privilege(r.oid, c.oid, 'SELECT'), false) as service_role_select,
  coalesce(has_table_privilege(r.oid, c.oid, 'INSERT'), false) as service_role_insert,
  coalesce(has_table_privilege(r.oid, c.oid, 'UPDATE'), false) as service_role_update,
  coalesce(has_table_privilege(r.oid, c.oid, 'DELETE'), false) as service_role_delete
from objects o
left join pg_class c on c.oid = o.relation_oid
left join pg_roles r on r.rolname = 'service_role'
order by o.table_name;

-- 3. 全部 12 个应用/迁移函数。RPC 参数名也是 PostgREST 查找函数的依据。
-- function_exists 校验输入类型，argument_names_match 进一步校验参数名及顺序。
with expected(migration, kind, function_name, input_types, argument_names) as (values
  ('0001', 'RPC', 'create_space_with_member', 'text,text,text,text,text,timestamp with time zone',
    array['p_name','p_nickname','p_timezone','p_invite_hash','p_token_digest','p_expires_at']),
  ('0001', 'RPC', 'join_space_by_invite', 'text,text,text,timestamp with time zone',
    array['p_invite_hash','p_nickname','p_token_digest','p_expires_at']),
  ('0002', 'RPC', 'remove_space_member', 'uuid,uuid,uuid',
    array['p_space_id','p_actor_id','p_target_id']),
  ('0002', 'RPC', 'transfer_space_owner', 'uuid,uuid,uuid',
    array['p_space_id','p_actor_id','p_target_id']),
  ('0003', 'RPC', 'open_direct_conversation', 'uuid,uuid,uuid',
    array['p_space_id','p_member_id','p_other_member_id']),
  ('0001', '授权辅助', 'is_active_member', 'uuid,uuid', array['p_space_id','p_member_id']),
  ('0001', '授权辅助', 'can_read_conversation', 'uuid,uuid', array['p_conversation_id','p_member_id']),
  ('0001', '授权辅助', 'can_send_message', 'uuid,uuid', array['p_conversation_id','p_member_id']),
  ('0001', '校验辅助', 'is_valid_timezone', 'text', array['p_timezone']),
  ('0001', '触发器函数', 'enforce_conversation_member_space', '', array[]::text[]),
  ('0001', '触发器函数', 'assert_message_sender_same_space', '', array[]::text[]),
  ('0004', '触发器函数', 'require_active_record_owner', '', array[]::text[])
), objects as (
  select *, to_regprocedure('public.' || function_name || '(' || input_types || ')') as function_oid
  from expected
)
select
  o.migration,
  o.kind,
  'public.' || o.function_name || '(' || o.input_types || ')' as expected_signature,
  p.oid is not null as function_exists,
  coalesce(coalesce(p.proargnames[1:p.pronargs], array[]::text[]) = o.argument_names, false)
    and p.oid is not null as argument_names_match,
  pg_get_function_identity_arguments(p.oid) as actual_arguments,
  pg_get_function_result(p.oid) as actual_result,
  coalesce(p.prosecdef, false) as security_definer,
  coalesce(has_function_privilege(r.oid, p.oid, 'EXECUTE'), false) as service_role_execute
from objects o
left join pg_proc p on p.oid = o.function_oid
left join pg_roles r on r.rolname = 'service_role'
order by o.migration, o.kind, o.function_name;

-- 4. 触发器是否已安装（仅函数存在不能证明 0004 已完整执行）。
with expected(migration, table_name, trigger_name, function_name) as (values
  ('0001', 'conversation_members', 'conversation_member_same_space', 'enforce_conversation_member_space'),
  ('0001', 'messages', 'messages_sender_same_space', 'assert_message_sender_same_space'),
  ('0004', 'daily_logs', 'active_log_owner', 'require_active_record_owner'),
  ('0004', 'daily_checkins', 'active_checkin_owner', 'require_active_record_owner'),
  ('0004', 'tasks', 'active_task_owner', 'require_active_record_owner')
)
select
  e.migration,
  e.table_name,
  e.trigger_name,
  t.oid is not null as trigger_exists,
  coalesce(t.tgenabled in ('O', 'A'), false) as trigger_enabled,
  coalesce(t.tgfoid = to_regprocedure('public.' || e.function_name || '()'), false)
    as trigger_function_matches
from expected e
left join pg_trigger t on t.tgrelid = to_regclass('public.' || e.table_name)
  and t.tgname = e.trigger_name and not t.tgisinternal
order by e.migration, e.table_name;

commit;
