-- Documents are read on the site itself. The text lives on the record; an external copy becomes optional.
-- Run once after 202610080001_taken_hunters.sql. Additive: existing documents keep their URLs until edited.
begin;

alter table public.library add column "body" text;
alter table public.library drop constraint library_url_check;
alter table public.library add constraint library_url_check check ("url" is null or "url"='' or "url" ~* '^https?://[^[:space:]]+$');
-- A document needs something to read: its text, an external copy, or both.
alter table public.library add constraint library_readable check (length(trim(coalesce("body",'')))>0 or length(trim(coalesce("url",'')))>0);

commit;
