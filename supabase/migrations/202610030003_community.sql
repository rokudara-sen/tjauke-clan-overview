-- Witness confirmation, pending-work counts, account self-service, promotion suggestions, recent changes,
-- portraits, glossary suggestions, and forum unread markers, mentions, reports and pinned threads.
-- Run once after 202610030002_accounts_forum.sql.
begin;

-- Witness confirmation. Naming or changing a witness asks them again; legacy witnesses stay unanswered rather than assumed confirmed.
alter table public.hunts add column "witness_status" text check ("witness_status" is null or "witness_status" in ('Requested','Confirmed','Declined'));
create function private.reset_witness() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.witness is null then new.witness_status:=null; elsif new.witness_status is null then new.witness_status:='Requested'; end if;
 elsif new.witness is distinct from old.witness then
  new.witness_status:=case when new.witness is null then null else 'Requested' end;
 end if;
 return new;
end; $$;
create trigger reset_witness before insert or update on public.hunts for each row execute function private.reset_witness();

create function private.my_member() returns public.members language sql stable security definer set search_path='' as $$
 select m.* from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
$$;

create function public.witness_requests() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me public.members:=private.my_member();
begin
 if me.id is null then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'hunter',m.name,'date',h.date,'era',h.era,'quarry',h.quarry,'weapon',h.weapon,'state',h.state,'witness_status',h.witness_status) order by h.witness_status<>'Requested',h.date desc nulls last)
  from public.hunts h left join public.members m on m.id=h.hunter where h.witness=me.id and not h.archived and h.review='Pending'),'[]'::jsonb);
end; $$;

create function public.respond_witness(hunt_id text,accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare me public.members:=private.my_member(); h public.hunts;
begin
 if me.id is null then raise exception 'No hunter record is linked to this account' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(982734);
 select * into h from public.hunts where id=hunt_id for update;
 if h.id is null or h.archived or h.witness is distinct from me.id then raise exception 'You are not the witness for this undertaking' using errcode='42501'; end if;
 if h.review is distinct from 'Pending' then raise exception 'This undertaking has already been judged'; end if;
 perform set_config('app.change_reason',case when accept then 'Witness confirmed' else 'Witness declined' end,true);
 update public.hunts set witness_status=case when accept then 'Confirmed' else 'Declined' end where id=hunt_id;
end; $$;

-- Portraits. Uploads go to a private bucket and are copied to the public one only on approval.
alter table public.members add column "portrait" text check ("portrait" is null or "portrait"='' or "portrait" ~* '^https?://[^[:space:]]+$');
create table private.portraits(id uuid primary key default gen_random_uuid(), member text not null references public.members(id) on delete cascade, path text not null unique,
 status text not null default 'pending' check(status in ('pending','approved','rejected','replaced')), uploaded_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), decided_at timestamptz);
alter table private.portraits enable row level security;

create function public.can_upload_portrait(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.hunter_accounts a join private.profiles p on p.user_id=a.user_id join public.members m on m.id=a.member
  where a.user_id=(select auth.uid()) and p.status='approved' and not m.archived and object_name like a.member||'/%' and object_name not like '%..%' and position('/' in substr(object_name,length(a.member)+2))=0);
$$;

create function public.submit_portrait(object_path text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.members:=private.my_member(); replaced jsonb;
begin
 if me.id is null then raise exception 'No hunter record is linked to this account' using errcode='42501'; end if;
 if not public.can_upload_portrait(object_path) then raise exception 'Invalid portrait path' using errcode='42501'; end if;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into replaced from private.portraits where member=me.id and status='pending';
 update private.portraits set status='replaced',decided_at=now() where member=me.id and status='pending';
 insert into private.portraits(member,path,uploaded_by) values(me.id,object_path,(select auth.uid()));
 return replaced;
end; $$;

create function public.my_portrait() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)-'uploaded_by' from private.portraits p where p.member=(private.my_member()).id order by created_at desc limit 1;
$$;

create function public.pending_portraits() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'member',p.member,'name',m.name,'path',p.path,'created_at',p.created_at,'current',m.portrait) order by p.created_at) from private.portraits p join public.members m on m.id=p.member where p.status='pending'),'[]'::jsonb);
end; $$;

create function public.decide_portrait(portrait_id uuid,approve boolean,public_url text) returns text language plpgsql security definer set search_path='' as $$
declare p private.portraits; previous text;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 select * into p from private.portraits where id=portrait_id and status='pending' for update;
 if p.id is null then raise exception 'This portrait is no longer waiting for review'; end if;
 if not approve then update private.portraits set status='rejected',decided_at=now() where id=p.id; return null; end if;
 if coalesce(public_url,'')!~*'^https?://[^[:space:]]+$' then raise exception 'A public portrait URL is required'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason','Portrait approved',true);
 select portrait into previous from public.members where id=p.member;
 update private.portraits set status='replaced',decided_at=now() where member=p.member and status='approved';
 update private.portraits set status='approved',decided_at=now() where id=p.id;
 update public.members set portrait=public_url where id=p.member;
 return previous;
end; $$;

do $$ begin
 if exists(select 1 from pg_namespace where nspname='storage') then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
   ('portraits','portraits',true,2097152,array['image/jpeg','image/png','image/webp']),
   ('portrait-uploads','portrait-uploads',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
  create policy portrait_upload_insert on storage.objects for insert to authenticated with check (bucket_id='portrait-uploads' and public.can_upload_portrait(name));
  create policy portrait_upload_read on storage.objects for select to authenticated using (bucket_id='portrait-uploads' and (public.is_admin() or public.can_upload_portrait(name)));
  create policy portrait_upload_delete on storage.objects for delete to authenticated using (bucket_id='portrait-uploads' and (public.is_admin() or public.can_upload_portrait(name)));
  create policy portrait_public_insert on storage.objects for insert to authenticated with check (bucket_id='portraits' and public.is_admin());
  create policy portrait_public_delete on storage.objects for delete to authenticated using (bucket_id='portraits' and public.is_admin());
 else raise notice 'Storage schema not found; portrait buckets were not created';
 end if;
end $$;

-- Promotion suggestions: accepted claims without a recorded promotion, until an administrator records or dismisses one.
create table private.promotion_dismissals(hunt text primary key references public.hunts(id) on delete cascade, dismissed_at timestamptz not null default now(), dismissed_by uuid references auth.users(id) on delete set null);
alter table private.promotion_dismissals enable row level security;
create function private.promotion_candidates() returns setof public.hunts language sql stable security definer set search_path='' as $$
 select h.* from public.hunts h where not h.archived and h.review='Accepted'
  and not exists(select 1 from public.promotions p where p.hunt=h.id and not p.archived)
  and not exists(select 1 from private.promotion_dismissals d where d.hunt=h.id);
$$;
create function public.promotion_suggestions() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('hunt',h.id,'name',h.name,'hunter',h.hunter,'date',h.date,'era',h.era,'trophy',h.trophy) order by h.date nulls last) from private.promotion_candidates() h),'[]'::jsonb);
end; $$;
create function public.dismiss_promotion(hunt_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 insert into private.promotion_dismissals(hunt,dismissed_by) values(hunt_id,(select auth.uid())) on conflict do nothing;
end; $$;

-- Glossary suggestions from approved accounts arrive as unpublished, provisional drafts.
create function public.suggest_term(term text,meaning text,category text,usage text) returns void language plpgsql security definer set search_path='' as $$
declare p private.profiles;
begin
 select * into p from private.profiles where user_id=(select auth.uid());
 if p.user_id is null or p.status<>'approved' then raise exception 'Suggestions are open to approved accounts' using errcode='42501'; end if;
 if length(trim(coalesce(term,'')))=0 or length(term)>80 then raise exception 'The term needs 1 to 80 characters'; end if;
 if length(trim(coalesce(meaning,'')))=0 or length(meaning)>200 then raise exception 'The meaning needs 1 to 200 characters'; end if;
 if length(coalesce(category,''))>60 or length(coalesce(usage,''))>2000 then raise exception 'Category or usage notes are too long'; end if;
 if (select count(*) from public.glossary g where not g.published and not g.archived and private.author('glossary',g.id)=p.user_id)>=5 then raise exception 'You have 5 suggestions waiting. Wait for an administrator to review them.'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason','Suggested by '||coalesce(p.username,'an account without a username'),true);
 perform private.write_record('glossary',jsonb_build_object('id','GLS-'||gen_random_uuid(),'name',trim(term),'meaning',trim(meaning),'status','Provisional','category',nullif(trim(category),''),'usage',nullif(trim(usage),''),'published',false));
end; $$;
create function public.my_suggestions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'meaning',g.meaning,'published',g.published,'archived',g.archived) order by g.created_at desc),'[]'::jsonb)
 from public.glossary g where private.author('glossary',g.id)=(select auth.uid());
$$;

-- Account self-service and renaming.
create function public.delete_my_account(confirm_username text) returns void language plpgsql security definer set search_path='' as $$
declare p private.profiles;
begin
 select * into p from private.profiles where user_id=(select auth.uid());
 if p.user_id is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if public.is_admin() then raise exception 'Administrators cannot delete their own account here. Remove administrator access first.'; end if;
 if p.username is null or lower(p.username)<>lower(trim(coalesce(confirm_username,''))) then raise exception 'Type your username exactly to confirm'; end if;
 delete from auth.users where id=p.user_id;
end; $$;

create function public.rename_account(account uuid,name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if not (public.username_available(name) or exists(select 1 from private.profiles where user_id=account and lower(username)=lower(name))) then raise exception 'That username is taken or not allowed'; end if;
 update private.profiles set username=name where user_id=account;
 if not found then raise exception 'Account not found'; end if;
end; $$;

-- Forum: pinned threads, read markers, mentions and reports.
alter table private.forum_threads add column pinned boolean not null default false;
create table private.forum_reads(user_id uuid not null references auth.users(id) on delete cascade, thread uuid not null references private.forum_threads(id) on delete cascade, last_read bigint not null default 0, primary key(user_id,thread));
create table private.forum_mentions(message bigint not null references private.forum_messages(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, seen boolean not null default false, primary key(message,user_id));
create table private.forum_reports(id bigint generated always as identity primary key, message bigint not null references private.forum_messages(id) on delete cascade, reporter uuid references auth.users(id) on delete set null,
 reason text not null check(length(trim(reason)) between 1 and 500), created_at timestamptz not null default now(), resolved boolean not null default false, unique(message,reporter));
create index forum_mentions_user on private.forum_mentions(user_id) where not seen;
alter table private.forum_reads enable row level security;
alter table private.forum_mentions enable row level security;
alter table private.forum_reports enable row level security;

-- Pinned threads keep messages past the retention period; the per-thread cap still applies.
create or replace function private.purge_forum() returns void language plpgsql security definer set search_path='' as $$
declare s private.forum_settings;
begin
 select * into s from private.forum_settings;
 delete from private.forum_messages m using private.forum_threads t where t.id=m.thread and not t.pinned and m.created_at<now()-make_interval(days=>s.retention_days);
 delete from private.forum_messages m using (select id,row_number() over (partition by thread order by created_at desc,id desc) n from private.forum_messages) r where m.id=r.id and r.n>s.thread_cap;
 delete from private.forum_threads t where not t.pinned and t.last_post_at<now()-make_interval(days=>s.retention_days) and not exists(select 1 from private.forum_messages where thread=t.id);
end; $$;

create or replace function private.forum_insert(thread_id uuid,body text) returns void language plpgsql security definer set search_path='' as $$
declare p private.profiles:=private.forum_member(); new_id bigint;
begin
 if p.username is null then raise exception 'Choose a username before posting'; end if;
 delete from private.forum_rate where posted_at<now()-interval '1 minute';
 if (select count(*) from private.forum_rate where author=p.user_id and posted_at>now()-interval '30 seconds')>=10 then raise exception 'You are posting too quickly. Wait a moment and try again.'; end if;
 insert into private.forum_rate(author) values(p.user_id);
 insert into private.forum_messages(thread,author,body) values(thread_id,p.user_id,trim(body)) returning id into new_id;
 update private.forum_threads set last_post_at=now() where id=thread_id;
 -- @username mentions of approved accounts. A trailing full stop or dash after a name is not part of it.
 insert into private.forum_mentions(message,user_id)
  select new_id,x.user_id from private.profiles x where x.status='approved' and x.user_id<>p.user_id and lower(x.username) in (
   select lower(c) from regexp_matches(body,'(?:^|[^A-Za-z0-9_.-])@([A-Za-z0-9][A-Za-z0-9_.-]{2,23})','g') m, unnest(array[m[1],rtrim(m[1],'.-_')]) c)
  on conflict do nothing;
 insert into private.forum_reads(user_id,thread,last_read) values(p.user_id,thread_id,new_id) on conflict(user_id,thread) do update set last_read=greatest(private.forum_reads.last_read,excluded.last_read);
 perform private.purge_forum();
end; $$;

create or replace function public.forum_threads() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
 perform private.forum_member();perform private.purge_forum();
 return jsonb_build_object('settings',(select jsonb_build_object('retention_days',retention_days,'thread_cap',thread_cap) from private.forum_settings),
  'threads',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'created_at',t.created_at,'last_post_at',t.last_post_at,'locked',t.locked,'pinned',t.pinned,'started_by',private.forum_author(t.created_by)->>'username',
   'messages',(select count(*) from private.forum_messages where thread=t.id),
   'unread',(select count(*) from private.forum_messages m where m.thread=t.id and m.author is distinct from uid and m.id>coalesce((select last_read from private.forum_reads r where r.user_id=uid and r.thread=t.id),0)),
   'mentioned',exists(select 1 from private.forum_mentions x join private.forum_messages m on m.id=x.message where m.thread=t.id and x.user_id=uid and not x.seen)) order by t.pinned desc,t.last_post_at desc) from private.forum_threads t),'[]'::jsonb));
end; $$;

create or replace function public.forum_thread(thread_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.forum_threads; admin boolean:=public.is_admin(); uid uuid:=(select auth.uid()); result jsonb; latest bigint;
begin
 perform private.forum_member();perform private.purge_forum();
 select * into t from private.forum_threads where id=thread_id;
 if t.id is null then raise exception 'This thread no longer exists'; end if;
 result:=jsonb_build_object('id',t.id,'title',t.title,'locked',t.locked,'pinned',t.pinned,'created_at',t.created_at,
  'settings',(select jsonb_build_object('retention_days',retention_days,'thread_cap',thread_cap) from private.forum_settings),
  'last_read',coalesce((select last_read from private.forum_reads where user_id=uid and thread=t.id),0),
  'messages',coalesce((select jsonb_agg(coalesce(private.forum_author(m.author),'{"username":null}'::jsonb)||jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at,'mine',m.author=uid,'can_delete',admin or m.author=uid,
   'reported',exists(select 1 from private.forum_reports r where r.message=m.id and r.reporter=uid and not r.resolved)) order by m.created_at,m.id) from private.forum_messages m where m.thread=t.id),'[]'::jsonb));
 select max(id) into latest from private.forum_messages where thread=t.id;
 if latest is not null then insert into private.forum_reads(user_id,thread,last_read) values(uid,t.id,latest) on conflict(user_id,thread) do update set last_read=greatest(private.forum_reads.last_read,excluded.last_read); end if;
 update private.forum_mentions x set seen=true from private.forum_messages m where m.id=x.message and m.thread=t.id and x.user_id=uid and not x.seen;
 return result;
end; $$;

create or replace function public.forum_moderate(thread_id uuid,action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if action='lock' then update private.forum_threads set locked=true where id=thread_id;
 elsif action='unlock' then update private.forum_threads set locked=false where id=thread_id;
 elsif action='pin' then update private.forum_threads set pinned=true where id=thread_id;
 elsif action='unpin' then update private.forum_threads set pinned=false,last_post_at=greatest(last_post_at,now()) where id=thread_id;
 elsif action='delete' then delete from private.forum_threads where id=thread_id;
 else raise exception 'Invalid action'; end if;
end; $$;

create function public.forum_report(message_id bigint,reason text) returns void language plpgsql security definer set search_path='' as $$
declare p private.profiles:=private.forum_member();
begin
 if not exists(select 1 from private.forum_messages where id=message_id) then raise exception 'This message no longer exists'; end if;
 if exists(select 1 from private.forum_messages where id=message_id and author=p.user_id) then raise exception 'You cannot report your own message'; end if;
 insert into private.forum_reports(message,reporter,reason) values(message_id,p.user_id,trim(reason)) on conflict(message,reporter) do update set reason=excluded.reason,resolved=false,created_at=now();
end; $$;

create function public.forum_reports() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 perform private.purge_forum();
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'message',m.id,'body',m.body,'author',private.forum_author(m.author)->>'username','thread',t.id,'title',t.title,'reporter',private.forum_author(r.reporter)->>'username','reason',r.reason,'created_at',r.created_at) order by r.created_at)
  from private.forum_reports r join private.forum_messages m on m.id=r.message join private.forum_threads t on t.id=m.thread where not r.resolved),'[]'::jsonb);
end; $$;

create function public.forum_resolve_report(report_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 update private.forum_reports set resolved=true where id=report_id;
end; $$;

-- Counts of waiting work for the signed-in account. Administrator counts are only included for administrators.
create function public.my_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); me public.members:=private.my_member(); p private.profiles; elder boolean; result jsonb;
begin
 if uid is null then return '{}'::jsonb; end if;
 select * into p from private.profiles where user_id=uid;
 elder:=coalesce(me.rank in ('Elder','Leader','Ancient'),false);
 result:=jsonb_build_object(
  'judgments',case when me.id is null then 0 else (select count(*) from public.hunts h where not h.archived and h.hunter<>me.id and h.review='Pending' and (not h.published or h.state='Completed')
   and (elder or exists(select 1 from public.members m join public.houses s on s.id=m.house where m.id=h.hunter and s.senior=me.id and not s.archived))) end,
  'history',case when elder then (select count(*) from public.chronicle c where not c.published and not c.archived and private.author('chronicle',c.id) is distinct from uid) else 0 end,
  'witness',case when me.id is null then 0 else (select count(*) from public.hunts h where h.witness=me.id and not h.archived and h.review='Pending' and h.witness_status='Requested') end,
  'mentions',(select count(*) from private.forum_mentions x where x.user_id=uid and not x.seen),
  'unread',case when coalesce(p.status,'')='approved' or public.is_admin() then (select count(*) from private.forum_threads t where exists(select 1 from private.forum_messages m where m.thread=t.id and m.author is distinct from uid
   and m.id>coalesce((select last_read from private.forum_reads r where r.user_id=uid and r.thread=t.id),0))) else 0 end);
 if public.is_admin() then
  result:=result||jsonb_build_object(
   'registrations',(select count(*) from private.profiles where status='pending'),
   'portraits',(select count(*) from private.portraits where status='pending'),
   'reports',(select count(*) from private.forum_reports where not resolved),
   'suggestions',(select count(*) from public.glossary g where not g.published and not g.archived and private.author('glossary',g.id) is distinct from uid),
   'promotions',(select count(*) from private.promotion_candidates()));
 end if;
 return result;
end; $$;

-- Recent changes to published records: names, dates and kind of change only. No reasons or authors.
create function public.recent_changes(max_rows integer default 8) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare entry record; found_name text; is_archived boolean; result jsonb:='[]'; taken integer:=0;
begin
 for entry in select * from (select distinct on (a.kind,a.record_id) a.kind,a.record_id,a.changed_at,a.operation,a.before_data,a.after_data from public.audit_log a
  where a.kind in ('clans','relations','members','houses','hunts','chronicle','duties','library','promotions','glossary') order by a.kind,a.record_id,a.id desc) latest order by latest.changed_at desc limit 200 loop
  execute format('select name,archived from public.%I where id=$1 and published',entry.kind) into found_name,is_archived using entry.record_id;
  continue when found_name is null;
  result:=result||jsonb_build_array(jsonb_build_object('kind',entry.kind,'id',entry.record_id,'name',found_name,'changed_at',entry.changed_at,
   'change',case when coalesce(entry.before_data->>'published','false')='false' and entry.after_data->>'published'='true' and entry.operation='UPDATE' then 'Published'
    when entry.before_data->>'archived'='false' and entry.after_data->>'archived'='true' then 'Archived'
    when entry.operation='INSERT' then 'Added' else 'Updated' end));
  taken:=taken+1;
  exit when taken>=least(greatest(coalesce(max_rows,8),1),20);
 end loop;
 return result;
end; $$;

revoke all on function private.reset_witness() from public;
revoke all on function private.my_member() from public;
revoke all on function private.promotion_candidates() from public;
do $$ declare f text; begin
 foreach f in array array['witness_requests()','respond_witness(text,boolean)','can_upload_portrait(text)','submit_portrait(text)','my_portrait()','pending_portraits()','decide_portrait(uuid,boolean,text)',
  'promotion_suggestions()','dismiss_promotion(text)','suggest_term(text,text,text,text)','my_suggestions()','delete_my_account(text)','rename_account(uuid,text)',
  'forum_report(bigint,text)','forum_reports()','forum_resolve_report(bigint)','my_queue()'] loop
  execute format('revoke all on function public.%s from public',f);
  execute format('grant execute on function public.%s to authenticated',f);
 end loop;
end $$;
revoke all on function public.recent_changes(integer) from public;
grant execute on function public.recent_changes(integer) to anon,authenticated;
commit;
