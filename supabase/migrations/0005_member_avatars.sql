-- Existing members keep a null value and receive a stable avatar in the UI.
-- Avatar edits use the existing server-only, active-member authorization path.
alter table public.members add column if not exists avatar_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass
      and conname = 'members_avatar_id_supported'
  ) then
    alter table public.members
      add constraint members_avatar_id_supported
      check (avatar_id is null or avatar_id in (
        'cat', 'rabbit', 'dog', 'fox', 'bear', 'panda',
        'koala', 'frog', 'pig', 'penguin', 'lion', 'raccoon'
      ));
  end if;
end
$$;
