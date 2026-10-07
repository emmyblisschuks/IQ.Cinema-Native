-- New kinds of content besides series and films. Added in their own migration:
-- a new enum value can't be used in the transaction that adds it.
alter type public.content_type add value if not exists 'music_video';
alter type public.content_type add value if not exists 'commercial';
