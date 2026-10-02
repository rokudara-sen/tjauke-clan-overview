-- Registration with administrator approval, usernames, and a members-only forum with limited retention.
-- Run once after 202610030001_hunters.sql.
begin;

-- One profile per Auth user. Emails stay in auth.users and are never returned by these functions.
create table private.profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text check (username ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$'),
 status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
 requested_member text references public.members(id) on delete set null,
 note text check (length(note)<=500),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid references auth.users(id) on delete set null);
create unique index profiles_username on private.profiles(lower(username));
alter table private.profiles enable row level security;

-- Accounts that existed before registration were created by an administrator, so they start approved.
insert into private.profiles(user_id,status,decided_at) select id,'approved',now() from auth.users on conflict do nothing;

create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare requested text:=new.raw_user_meta_data->>'member';
begin
 insert into private.profiles(user_id,username,note,requested_member) values(new.id,nullif(trim(new.raw_user_meta_data->>'username'),''),nullif(left(trim(new.raw_user_meta_data->>'note'),500),''),
  case when exists(select 1 from public.members where id=requested and published and not archived) then requested end);
 return new;
end; $$;
create trigger create_profile after insert on auth.users for each row execute function private.create_profile();

-- A hunter link requires an approved account; losing approval removes the link.
create function private.require_approved_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.profiles where user_id=new.user_id and status='approved') then raise exception 'Approve the account before linking a hunter'; end if;
 return new;
end; $$;
create trigger require_approved before insert or update on private.hunter_accounts for each row execute function private.require_approved_link();
create function private.drop_link_on_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'approved' then delete from private.hunter_accounts where user_id=new.user_id; end if;
 return new;
end; $$;
create trigger drop_link after update of status on private.profiles for each row execute function private.drop_link_on_status();

create function public.username_available(name text) returns boolean language sql stable security definer set search_path='' as $$
 select name ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$' and not exists(select 1 from private.profiles where lower(username)=lower(name));
$$;

create or replace function public.my_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me public.members; p private.profiles;
begin
 select * into p from private.profiles where user_id=(select auth.uid());
 select m.* into me from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
 return jsonb_build_object('admin',public.is_admin(),'username',p.username,'status',coalesce(p.status,'pending'),'member',me.id,'name',me.name,'rank',me.rank,
  'elder',coalesce(me.rank in ('Elder','Leader','Ancient'),false),
  'seniorOf',coalesce((select jsonb_agg(h.id) from public.houses h where h.senior=me.id and not h.archived),'[]'::jsonb));
end; $$;

create function public.claim_username(name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if not public.username_available(name) then raise exception 'That username is taken or not allowed'; end if;
 update private.profiles set username=name where user_id=(select auth.uid()) and username is null;
 if not found then raise exception 'This account already has a username'; end if;
end; $$;

create function public.list_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'username',p.username,'status',p.status,'note',p.note,'requested',p.requested_member,'member',a.member,'created_at',p.created_at,'admin',exists(select 1 from private.administrators x where x.user_id=p.user_id)) order by p.status<>'pending',p.created_at desc)
  from private.profiles p left join private.hunter_accounts a on a.user_id=p.user_id),'[]'::jsonb);
end; $$;

-- Accounts are addressed by profile ID so that accounts without a username can still be reviewed.
create function public.review_account(account uuid,decision text,member_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if account=(select auth.uid()) then raise exception 'You cannot change your own account'; end if;
 if decision not in ('approved','rejected','suspended') then raise exception 'Invalid decision'; end if;
 update private.profiles set status=decision,decided_at=now(),decided_by=(select auth.uid()) where user_id=account;
 if not found then raise exception 'Account not found'; end if;
 if decision='approved' then
  if member_id is null or member_id='' then delete from private.hunter_accounts where user_id=account;
  else
   if not exists(select 1 from public.members where id=member_id and not archived) then raise exception 'Hunter record not found'; end if;
   if exists(select 1 from private.hunter_accounts where member=member_id and user_id<>account) then raise exception 'Another account is already linked to this hunter'; end if;
   insert into private.hunter_accounts(user_id,member) values(account,member_id) on conflict(user_id) do update set member=excluded.member;
  end if;
 end if;
end; $$;

drop function public.link_hunter_account(text,text);
drop function public.unlink_hunter_account(text);
drop function public.list_hunter_accounts();

-- Forum. Tables are private; every read and write goes through the functions below.
create table private.forum_settings(id boolean primary key default true check(id), retention_days integer not null default 30 check(retention_days between 1 and 365), thread_cap integer not null default 200 check(thread_cap between 5 and 5000));
insert into private.forum_settings default values;
create table private.forum_threads(id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 120), created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), last_post_at timestamptz not null default now(), locked boolean not null default false);
create table private.forum_messages(id bigint generated always as identity primary key, thread uuid not null references private.forum_threads(id) on delete cascade, author uuid references auth.users(id) on delete set null, body text not null check(length(trim(body)) between 1 and 2000), created_at timestamptz not null default now());
create index forum_messages_thread on private.forum_messages(thread,created_at);
create index forum_messages_author on private.forum_messages(author,created_at);
-- Posting times for rate limiting, kept separately because the thread cap deletes messages.
create table private.forum_rate(author uuid not null references auth.users(id) on delete cascade, posted_at timestamptz not null default now());
create index forum_rate_author on private.forum_rate(author,posted_at);
alter table private.forum_rate enable row level security;
alter table private.forum_settings enable row level security;
alter table private.forum_threads enable row level security;
alter table private.forum_messages enable row level security;

-- Deletes expired messages, trims each thread to the cap, and removes empty expired threads.
create function private.purge_forum() returns void language plpgsql security definer set search_path='' as $$
declare s private.forum_settings;
begin
 select * into s from private.forum_settings;
 delete from private.forum_messages where created_at<now()-make_interval(days=>s.retention_days);
 delete from private.forum_messages m using (select id,row_number() over (partition by thread order by created_at desc,id desc) n from private.forum_messages) r where m.id=r.id and r.n>s.thread_cap;
 delete from private.forum_threads t where t.last_post_at<now()-make_interval(days=>s.retention_days) and not exists(select 1 from private.forum_messages where thread=t.id);
end; $$;

create function private.forum_member() returns private.profiles language plpgsql security definer set search_path='' as $$
declare p private.profiles;
begin
 select * into p from private.profiles where user_id=(select auth.uid());
 if p.user_id is null or (p.status<>'approved' and not public.is_admin()) then raise exception 'The forum is open to approved accounts' using errcode='42501'; end if;
 return p;
end; $$;

create function private.forum_author(account uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('username',p.username,'member',m.id,'member_name',m.name) from private.profiles p left join private.hunter_accounts a on a.user_id=p.user_id left join public.members m on m.id=a.member and m.published and not m.archived where p.user_id=account;
$$;

create function public.forum_threads() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.forum_member();perform private.purge_forum();
 return jsonb_build_object('settings',(select jsonb_build_object('retention_days',retention_days,'thread_cap',thread_cap) from private.forum_settings),
  'threads',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'created_at',t.created_at,'last_post_at',t.last_post_at,'locked',t.locked,'started_by',private.forum_author(t.created_by)->>'username',
   'messages',(select count(*) from private.forum_messages where thread=t.id)) order by t.last_post_at desc) from private.forum_threads t),'[]'::jsonb));
end; $$;

create function public.forum_thread(thread_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.forum_threads; admin boolean:=public.is_admin();
begin
 perform private.forum_member();perform private.purge_forum();
 select * into t from private.forum_threads where id=thread_id;
 if t.id is null then raise exception 'This thread no longer exists'; end if;
 return jsonb_build_object('id',t.id,'title',t.title,'locked',t.locked,'created_at',t.created_at,
  'settings',(select jsonb_build_object('retention_days',retention_days,'thread_cap',thread_cap) from private.forum_settings),
  'messages',coalesce((select jsonb_agg(coalesce(private.forum_author(m.author),'{"username":null}'::jsonb)||jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at,'mine',m.author=(select auth.uid()),'can_delete',admin or m.author=(select auth.uid())) order by m.created_at,m.id) from private.forum_messages m where m.thread=t.id),'[]'::jsonb));
end; $$;

create function private.forum_insert(thread_id uuid,body text) returns void language plpgsql security definer set search_path='' as $$
declare p private.profiles:=private.forum_member();
begin
 if p.username is null then raise exception 'Choose a username before posting'; end if;
 delete from private.forum_rate where posted_at<now()-interval '1 minute';
 if (select count(*) from private.forum_rate where author=p.user_id and posted_at>now()-interval '30 seconds')>=10 then raise exception 'You are posting too quickly. Wait a moment and try again.'; end if;
 insert into private.forum_rate(author) values(p.user_id);
 insert into private.forum_messages(thread,author,body) values(thread_id,p.user_id,trim(body));
 update private.forum_threads set last_post_at=now() where id=thread_id;
 perform private.purge_forum();
end; $$;

create function public.forum_post(thread_id uuid,body text) returns void language plpgsql security definer set search_path='' as $$
declare t private.forum_threads;
begin
 perform private.forum_member();
 select * into t from private.forum_threads where id=thread_id for update;
 if t.id is null then raise exception 'This thread no longer exists'; end if;
 if t.locked and not public.is_admin() then raise exception 'This thread is locked'; end if;
 perform private.forum_insert(thread_id,body);
end; $$;

create function public.forum_create_thread(title text,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare p private.profiles:=private.forum_member(); new_id uuid;
begin
 if p.username is null then raise exception 'Choose a username before posting'; end if;
 insert into private.forum_threads(title,created_by) values(trim(title),p.user_id) returning id into new_id;
 perform private.forum_insert(new_id,body);
 return new_id;
end; $$;

create function public.forum_delete_message(message_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.forum_member();
 delete from private.forum_messages where id=message_id and (author=(select auth.uid()) or public.is_admin());
 if not found then raise exception 'You can only delete your own messages' using errcode='42501'; end if;
end; $$;

create function public.forum_moderate(thread_id uuid,action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if action='lock' then update private.forum_threads set locked=true where id=thread_id;
 elsif action='unlock' then update private.forum_threads set locked=false where id=thread_id;
 elsif action='delete' then delete from private.forum_threads where id=thread_id;
 else raise exception 'Invalid action'; end if;
end; $$;

create function public.forum_configure(days integer,cap integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 update private.forum_settings set retention_days=days,thread_cap=cap;
 perform private.purge_forum();
end; $$;

revoke all on function private.create_profile() from public;
revoke all on function private.require_approved_link() from public;
revoke all on function private.drop_link_on_status() from public;
revoke all on function private.purge_forum() from public;
revoke all on function private.forum_member() from public;
revoke all on function private.forum_author(uuid) from public;
revoke all on function private.forum_insert(uuid,text) from public;
do $$ declare f text; begin
 foreach f in array array['username_available(text)','claim_username(text)','list_accounts()','review_account(uuid,text,text)','forum_threads()','forum_thread(uuid)','forum_post(uuid,text)','forum_create_thread(text,text)','forum_delete_message(bigint)','forum_moderate(uuid,text)','forum_configure(integer,integer)'] loop
  execute format('revoke all on function public.%s from public',f);
  execute format('grant execute on function public.%s to authenticated',f);
 end loop;
end $$;
grant execute on function public.username_available(text) to anon;

-- Hourly purge where pg_cron is available. Without it, purging still runs on every forum read and post.
do $$ begin
 create extension if not exists pg_cron;
 perform cron.schedule('forum-purge','17 * * * *','select private.purge_forum()');
exception when others then raise notice 'pg_cron unavailable; forum purging runs on forum activity only';
end $$;
commit;
