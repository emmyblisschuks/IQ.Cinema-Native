-- Length limits per content type: music videos up to 10:00, commercials up to 3:00.
create or replace function public.max_duration_seconds_for(ct public.content_type)
returns integer
language sql
immutable
set search_path = public
as $$
  select case ct
    when 'short_episode' then 160    -- 2:40
    when 'full_episode'  then 1200   -- 20:00
    when 'one_part_film' then 7200   -- 120:00
    when 'music_video'   then 600    -- 10:00
    when 'commercial'    then 180    -- 3:00
  end;
$$;

-- Collections: music videos and commercials get their own category.
alter table public.titles drop constraint if exists titles_category_check;
alter table public.titles add constraint titles_category_check
  check (category = any (array['drama','story','anime','music','commercial']));

-- Optional credit line: the artist of a music video / the brand of a commercial.
alter table public.titles add column if not exists credit_name text;

-- My List validates the category filter against the same list; extend it by
-- rewriting the literal inside the existing function definition.
do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosrc like '%''drama'', ''story'', ''anime''%'
  loop
    def := replace(
      pg_get_functiondef(r.oid),
      '''drama'', ''story'', ''anime''',
      '''drama'', ''story'', ''anime'', ''music'', ''commercial'''
    );
    execute def;
  end loop;
end $$;
