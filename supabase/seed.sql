-- Deterministic demo data only. No credentials, raw member sessions, or
-- invitation values are stored in the seed.
insert into public.spaces (id, name, timezone)
values ('00000000-0000-0000-0000-000000000001', 'Demo Space', 'Asia/Shanghai')
on conflict (id) do nothing;

insert into public.members (id, space_id, nickname, role)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Alice', 'creator'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Bob', 'member')
on conflict (id) do nothing;

update public.spaces
set creator_member_id = '00000000-0000-0000-0000-000000000011'
where id = '00000000-0000-0000-0000-000000000001';

insert into public.conversations (id, space_id, kind)
values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'group')
on conflict (id) do nothing;

insert into public.conversation_members (conversation_id, member_id)
values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000012')
on conflict do nothing;
