-- Space identity is an object icon; member and account profile avatars remain animals.
alter table public.spaces drop constraint if exists spaces_avatar_id_supported;

update public.spaces set avatar_id = case avatar_id
  when 'cat' then 'book'
  when 'rabbit' then 'coffee'
  when 'dog' then 'camera'
  when 'fox' then 'rocket'
  when 'bear' then 'lamp'
  when 'panda' then 'headphones'
  when 'koala' then 'backpack'
  when 'frog' then 'compass'
  when 'pig' then 'trophy'
  when 'penguin' then 'plant'
  when 'lion' then 'palette'
  when 'raccoon' then 'tent'
  else avatar_id
end
where avatar_id is not null;

alter table public.spaces add constraint spaces_avatar_id_supported check (
  avatar_id is null or avatar_id in (
    'book','coffee','camera','rocket','lamp','headphones',
    'backpack','compass','trophy','plant','palette','tent'
  )
);
