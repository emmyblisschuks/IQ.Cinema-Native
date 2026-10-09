-- Read-only. Paste into Supabase SQL editor, run once, send me the single JSON result.
select jsonb_pretty(jsonb_build_object(
  'promo_feed', (
    select jsonb_build_object(
      'published_titles', (select count(*) from titles where status = 'published'),
      'published_promo_episodes', (select count(*) from episodes e join titles t on t.id = e.title_id
                                    where e.is_promo and e.status = 'published' and t.status = 'published'),
      'promo_without_video', (select count(*) from episodes where is_promo and status = 'published' and video_url is null),
      'feed_rpc_rows', (select count(*) from get_for_you_feed_v2('for_you', 30, 0, null))
    )
  ),
  'notifications_columns', (
    select jsonb_agg(jsonb_build_object('col', column_name, 'type', data_type, 'nullable', is_nullable))
    from information_schema.columns where table_schema = 'public' and table_name = 'notifications'
  ),
  'notifications_constraints', (
    select jsonb_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid = 'public.notifications'::regclass
  ),
  'notifications_policies', (
    select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'qual', qual, 'check', with_check))
    from pg_policies where schemaname = 'public' and tablename = 'notifications'
  ),
  'notifications_in_realtime', (
    select exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications')
  ),
  'notifications_triggers_on_titles', (
    select jsonb_agg(tgname) from pg_trigger where tgrelid = 'public.titles'::regclass and not tgisinternal
  ),
  'notifications_count_by_type', (
    select jsonb_object_agg(coalesce(t::text, 'null'), n) from (select type as t, count(*) n from notifications group by type) x
  ),
  'titles_by_status', (
    select jsonb_object_agg(status, n) from (select status::text, count(*) n from titles group by status) x
  ),
  'in_review_titles', (
    select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title,
      'episodes', (select jsonb_agg(jsonb_build_object('n', e.episode_number, 'video_url', e.video_url, 'status', e.status))
                   from episodes e where e.title_id = t.id)))
    from titles t where t.status = 'in_review'
  ),
  'storage_videos_policies', (
    select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual))
    from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%videos%' or with_check ilike '%videos%')
  ),
  'videos_bucket', (select jsonb_build_object('public', public, 'file_size_limit', file_size_limit) from storage.buckets where id = 'videos'),
  'is_admin_def', (select pg_get_functiondef('public.is_admin()'::regprocedure))
));
