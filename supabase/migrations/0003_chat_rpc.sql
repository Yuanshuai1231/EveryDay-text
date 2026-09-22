-- Only the server, after resolving its custom-cookie session, can call this
-- transaction. Lock both active members in a stable order so membership
-- removal cannot race the creation of the conversation and its participants.
create or replace function public.open_direct_conversation(
  p_space_id uuid,
  p_member_id uuid,
  p_other_member_id uuid
)
returns setof public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low uuid;
  v_high uuid;
  v_count integer;
  v_conversation public.conversations%rowtype;
begin
  if p_member_id = p_other_member_id then
    raise exception using errcode = '22023', message = 'direct conversation requires two members';
  end if;
  v_low := least(p_member_id, p_other_member_id);
  v_high := greatest(p_member_id, p_other_member_id);

  perform id from public.members
  where space_id = p_space_id and id in (v_low, v_high) and removed_at is null
  order by id for update;
  get diagnostics v_count = row_count;
  if v_count <> 2 then
    raise exception using errcode = '42501', message = 'both conversation members must be active';
  end if;

  insert into public.conversations(space_id, kind, direct_member_low, direct_member_high)
  values(p_space_id, 'direct', v_low, v_high)
  on conflict(space_id, direct_member_low, direct_member_high) where kind = 'direct'
  do update set kind = excluded.kind
  returning * into v_conversation;

  insert into public.conversation_members(conversation_id, member_id)
  values(v_conversation.id, v_low), (v_conversation.id, v_high)
  on conflict(conversation_id, member_id) do nothing;

  return next v_conversation;
end;
$$;

revoke all on function public.open_direct_conversation(uuid, uuid, uuid) from public;
grant execute on function public.open_direct_conversation(uuid, uuid, uuid) to service_role;
