-- Notifications for the title review flow (NOT applied automatically).
--  * creator is told when their project is approved / declined
--  * admins are told when a project is submitted for review
-- The app's bell + notifications screen already listen to public.notifications
-- over realtime, so these rows light the bell instantly.

create or replace function public.notify_title_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'in_review' and new.status = 'published' then
    insert into public.notifications (user_id, type, title, body, metadata)
    values (new.creator_id, 'title_approved', new.title || ' is approved',
            'Your project passed review and is now live.',
            jsonb_build_object('title_id', new.id, 'slug', new.slug, 'href', '/creator/title/' || new.id));

  elsif old.status = 'in_review' and new.status = 'rejected' then
    insert into public.notifications (user_id, type, title, body, metadata)
    values (new.creator_id, 'title_declined', new.title || ' needs changes',
            coalesce(nullif(new.admin_review_note, ''), 'Your project was declined. Open it to see the note and resubmit.'),
            jsonb_build_object('title_id', new.id, 'slug', new.slug, 'href', '/creator/title/' || new.id));

  elsif new.status = 'in_review' then
    insert into public.notifications (user_id, type, title, body, metadata)
    select p.id, 'title_submitted', new.title || ' is waiting for review',
           'A creator submitted a project for approval.',
           jsonb_build_object('title_id', new.id, 'slug', new.slug)
    from public.profiles p
    where p.is_admin;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_titles_notify_review on public.titles;
create trigger trg_titles_notify_review
  after update of status on public.titles
  for each row
  execute function public.notify_title_review();
