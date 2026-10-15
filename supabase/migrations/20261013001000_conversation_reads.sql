create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, member_id)
);
create index conversation_reads_member_idx on public.conversation_reads(member_id, conversation_id);
alter table public.conversation_reads enable row level security;
revoke all on public.conversation_reads from anon, authenticated;
grant all on public.conversation_reads to service_role;
