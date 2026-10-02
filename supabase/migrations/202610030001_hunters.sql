-- Rank history, glossary, dated assessments and hunter accounts.
-- Run once after 202610020001_archive.sql. Additive: no existing record is changed.
begin;

-- Dated assessments. A superseded assessment is archived, so one direction keeps its history.
alter table public.relations add column "assessed" date;

create table public.promotions(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "member" text check (("member" is not null and length(trim("member"))>0)),
 "rank" text check (("rank" is not null and length(trim("rank"))>0) and ("rank" is null or "rank" in ('Unblooded','Young Blood','Blooded','Elite','Elder','Leader','Ancient'))),
 "date" date,
 "era" text,
 "hunt" text,
 "grounds" text,
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')));
alter table public.promotions enable row level security;
revoke all on public.promotions from anon,authenticated;
grant select on public.promotions to authenticated;
create policy admin_read on public.promotions for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.promotions for each row execute function private.audit_change();
create trigger stamp before update on public.promotions for each row execute function private.stamp_record();
alter table public.promotions add constraint promotions_member_fk foreign key ("member") references public.members(id) deferrable initially deferred;
alter table public.promotions add constraint promotions_hunt_fk foreign key ("hunt") references public.hunts(id) deferrable initially deferred;

create table public.glossary(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "meaning" text check (("meaning" is not null and length(trim("meaning"))>0)),
 "status" text check (("status" is not null and length(trim("status"))>0) and ("status" is null or "status" in ('Provisional','In clan use','Disputed'))),
 "category" text,
 "usage" text,
 "doc" text,
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')));
alter table public.glossary enable row level security;
revoke all on public.glossary from anon,authenticated;
grant select on public.glossary to authenticated;
create policy admin_read on public.glossary for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.glossary for each row execute function private.audit_change();
create trigger stamp before update on public.glossary for each row execute function private.stamp_record();
alter table public.glossary add constraint glossary_doc_fk foreign key ("doc") references public.library(id) deferrable initially deferred;

create or replace function public.public_archive() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}';
begin
 select result || jsonb_build_object('clans',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.clans t where published;
 select result || jsonb_build_object('relations',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.relations t where published;
 select result || jsonb_build_object('members',coalesce(jsonb_agg(case when t.player_public then to_jsonb(t)-array['created_at','updated_at','player_public'] else to_jsonb(t)-array['created_at','updated_at','player_public','player'] end), '[]'::jsonb)) into result from public.members t where published;
 select result || jsonb_build_object('houses',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.houses t where published;
 select result || jsonb_build_object('hunts',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.hunts t where published;
 select result || jsonb_build_object('chronicle',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.chronicle t where published;
 select result || jsonb_build_object('duties',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.duties t where published;
 select result || jsonb_build_object('library',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.library t where published;
 select result || jsonb_build_object('settings',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.settings t where published;
 select result || jsonb_build_object('promotions',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.promotions t where published;
 select result || jsonb_build_object('glossary',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.glossary t where published;
 return result;
end; $$;

-- Shared upsert used by administrator and hunter saves. Callers check permission, lock and concurrency first.
create function private.write_record(record_kind text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare col_list text; update_list text; clean jsonb;
begin
 clean:=payload - array['created_at','updated_at'];
 select jsonb_object_agg(key,case when value='""'::jsonb then 'null'::jsonb else value end) into clean from jsonb_each(clean);
 select string_agg(format('%I',column_name),',' order by ordinal_position),string_agg(format('%I=excluded.%I',column_name,column_name),',' order by ordinal_position) into col_list,update_list from information_schema.columns where table_schema='public' and table_name=record_kind and column_name not in ('created_at','updated_at');
 clean:=jsonb_build_object('archived',false,'published',false,'player_public',false)||clean;
 execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set %s',record_kind,col_list,col_list,record_kind,update_list) using clean;
end; $$;

create or replace function public.save_record(record_kind text,payload jsonb,expected_updated timestamptz,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare current_updated timestamptz;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if record_kind not in ('clans','relations','members','houses','hunts','chronicle','duties','library','settings','promotions','glossary') then raise exception 'Invalid record type'; end if;
 if length(trim(coalesce(change_reason,'')))=0 then raise exception 'Change reason is required'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason',change_reason,true);
 execute format('select updated_at from public.%I where id=$1 for update',record_kind) into current_updated using payload->>'id';
 if current_updated is distinct from expected_updated then raise exception 'Record changed since it was opened. Reload before saving.' using errcode='40001'; end if;
 perform private.write_record(record_kind,payload);
end; $$;

-- Archive the current assessment of one direction and record its replacement in one transaction.
create function public.supersede_relation(old_id text,payload jsonb,expected_updated timestamptz,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare old public.relations;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if length(trim(coalesce(change_reason,'')))=0 then raise exception 'Change reason is required'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason',change_reason,true);
 select * into old from public.relations where id=old_id for update;
 if old.id is null or old.archived then raise exception 'Only a current assessment can be superseded'; end if;
 if old.updated_at is distinct from expected_updated then raise exception 'Record changed since it was opened. Reload before saving.' using errcode='40001'; end if;
 if payload->>'from' is distinct from old."from" or payload->>'to' is distinct from old."to" then raise exception 'A new assessment must keep the same direction'; end if;
 if exists(select 1 from public.relations where id=payload->>'id') then raise exception 'The new assessment needs a new ID'; end if;
 update public.relations set archived=true where id=old_id;
 perform private.write_record('relations',payload||jsonb_build_object('archived',false));
end; $$;

-- Hunter accounts: one application user per hunter record, linked by an administrator.
create table private.hunter_accounts(user_id uuid primary key references auth.users(id) on delete cascade, member text not null unique references public.members(id));
alter table private.hunter_accounts enable row level security;

create function private.author(record_kind text,record_id text) returns uuid language sql stable security definer set search_path='' as $$
 select actor from public.audit_log where kind=record_kind and record_id=author.record_id and operation='INSERT' order by id limit 1;
$$;

create function public.my_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me public.members;
begin
 select m.* into me from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
 return jsonb_build_object('admin',public.is_admin(),'member',me.id,'name',me.name,'rank',me.rank,
  'elder',coalesce(me.rank in ('Elder','Leader','Ancient'),false),
  'seniorOf',coalesce((select jsonb_agg(h.id) from public.houses h where h.senior=me.id and not h.archived),'[]'::jsonb));
end; $$;

-- What a signed-in hunter may see beyond the public archive: their own record, their households,
-- their undertakings, undertakings they can judge, and history drafts if they are Elder or above.
create function public.hunter_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me public.members; elder boolean;
begin
 select m.* into me from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
 if me.id is null then raise exception 'No hunter record is linked to this account' using errcode='42501'; end if;
 elder:=me.rank in ('Elder','Leader','Ancient');
 return jsonb_build_object(
  'member',to_jsonb(me),
  'houses',coalesce((select jsonb_agg(to_jsonb(h)) from public.houses h where h.senior=me.id and not h.archived),'[]'::jsonb),
  'hunts',coalesce((select jsonb_agg(to_jsonb(h)) from public.hunts h where not h.archived and (h.hunter=me.id or ((h.review='Pending' or not h.published) and (elder or exists(select 1 from public.members m join public.houses s on s.id=m.house where m.id=h.hunter and s.senior=me.id and not s.archived))))),'[]'::jsonb),
  'chronicle',case when elder then coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('mine',private.author('chronicle',c.id) is not distinct from (select auth.uid()))) from public.chronicle c where not c.published and not c.archived),'[]'::jsonb) else '[]'::jsonb end);
end; $$;

-- Hunter edits. Permissions follow rank and household seniority:
--  every hunter: own profile prose (live), declare and update own undertakings until judged (drafts);
--  household senior: household prose (live), judge and publish undertakings of the household's hunters;
--  Elder, Leader, Ancient: judge and publish any undertaking, add history drafts, publish another hunter's history draft.
-- Rank, standing, household, sponsor, duties, politics and published history stay administrator-only.
create function public.hunter_save(record_kind text,payload jsonb,expected_updated timestamptz,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare me public.members; elder boolean; cur jsonb; current_updated timestamptz; allowed text[]; merged jsonb; denied text; judge boolean;
 target text:=payload->>'id'; content text[]:=array['name','era','order','date','category','member','house','hunt','certainty','summary','body','source'];
begin
 select m.* into me from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
 if me.id is null then raise exception 'No hunter record is linked to this account' using errcode='42501'; end if;
 if record_kind not in ('members','houses','hunts','chronicle') then raise exception 'Hunters cannot edit this record type' using errcode='42501'; end if;
 if length(trim(coalesce(change_reason,'')))=0 then raise exception 'Change reason is required'; end if;
 elder:=me.rank in ('Elder','Leader','Ancient');
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason',change_reason,true);
 execute format('select to_jsonb(t),t.updated_at from public.%I t where id=$1 for update',record_kind) into cur,current_updated using target;
 if current_updated is distinct from expected_updated then raise exception 'Record changed since it was opened. Reload before saving.' using errcode='40001'; end if;

 if record_kind='members' then
  if cur is null or target<>me.id then raise exception 'You can only edit your own hunter record' using errcode='42501'; end if;
  allowed:=array['epithet','biography','appearance','hooks','source'];
 elsif record_kind='houses' then
  if cur is null or cur->>'senior' is distinct from me.id or (cur->>'archived')::boolean then raise exception 'Only the household senior can edit this household' using errcode='42501'; end if;
  allowed:=array['meaning','vessel','history','identity'];
 elsif record_kind='hunts' then
  if cur is null then
   if payload->>'hunter' is distinct from me.id then raise exception 'You can only declare your own undertakings' using errcode='42501'; end if;
   if coalesce(target,'')!~'^HNT-' then raise exception 'Invalid record ID'; end if;
   if coalesce(payload->>'state','') not in ('Planned','Declared') then raise exception 'A new undertaking starts as Planned or Declared'; end if;
   cur:=jsonb_build_object('id',target,'hunter',me.id,'archived',false,'published',false,'review','Pending','outside','Unknown');
   allowed:=array['name','witness','date','era','quarry','weapon','limits','state','outside','source'];
  elsif cur->>'hunter'=me.id then
   if cur->>'review' is distinct from 'Pending' or (cur->>'archived')::boolean then raise exception 'This undertaking has been judged. Ask an administrator to change it.' using errcode='42501'; end if;
   if payload->>'state'='Invalidated' and cur->>'state'<>'Invalidated' then raise exception 'Only a judge can invalidate an undertaking' using errcode='42501'; end if;
   allowed:=array['name','witness','date','era','quarry','weapon','limits','state','outside','trophy','account','source'];
  else
   select true into judge from public.members m join public.houses h on h.id=m.house where m.id=cur->>'hunter' and h.senior=me.id and not h.archived;
   if (cur->>'archived')::boolean or not (elder or coalesce(judge,false)) then raise exception 'You cannot judge this undertaking' using errcode='42501'; end if;
   allowed:=array['review','judgment','state','published'];
  end if;
 else
  if not elder then raise exception 'Only Elder, Leader or Ancient hunters can add history' using errcode='42501'; end if;
  if cur is null then
   if coalesce(target,'')!~'^HIS-' then raise exception 'Invalid record ID'; end if;
   cur:=jsonb_build_object('id',target,'archived',false,'published',false);
   allowed:=content;
  elsif (cur->>'published')::boolean or (cur->>'archived')::boolean then raise exception 'Published history can only be changed by an administrator' using errcode='42501';
  elsif private.author('chronicle',target) is not distinct from (select auth.uid()) then allowed:=content;
  else allowed:=content||array['published'];
  end if;
 end if;

 -- Refuse attempts to change anything outside the permitted fields instead of silently dropping them.
 if current_updated is not null then
  select string_agg(key,', ') into denied from jsonb_each(payload) p where key<>all(allowed) and key not in ('id','created_at','updated_at','mine')
   and nullif(p.value#>>'{}','') is distinct from nullif(cur->>key,'');
  if denied is not null then raise exception 'You cannot change: %',denied using errcode='42501'; end if;
 end if;
 select cur||coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into merged from jsonb_each(payload) where key=any(allowed);
 perform private.write_record(record_kind,merged);
end; $$;

create function public.link_hunter_account(account_email text,member_id text) returns void language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 select id into account from auth.users where lower(email)=lower(trim(account_email));
 if account is null then raise exception 'No account exists for that email. Invite the hunter first.'; end if;
 if not exists(select 1 from public.members where id=member_id) then raise exception 'Hunter record not found'; end if;
 if exists(select 1 from private.hunter_accounts where member=member_id and user_id<>account) then raise exception 'Another account is already linked to this hunter'; end if;
 insert into private.hunter_accounts(user_id,member) values(account,member_id) on conflict(user_id) do update set member=excluded.member;
end; $$;

create function public.unlink_hunter_account(account_email text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 delete from private.hunter_accounts a using auth.users u where u.id=a.user_id and lower(u.email)=lower(trim(account_email));
end; $$;

create function public.list_hunter_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('email',u.email,'member',a.member) order by u.email) from private.hunter_accounts a join auth.users u on u.id=a.user_id),'[]'::jsonb);
end; $$;

revoke all on function private.write_record(text,jsonb) from public;
revoke all on function private.author(text,text) from public;
revoke all on function public.supersede_relation(text,jsonb,timestamptz,text) from public;
revoke all on function public.my_access() from public;
revoke all on function public.hunter_workspace() from public;
revoke all on function public.hunter_save(text,jsonb,timestamptz,text) from public;
revoke all on function public.link_hunter_account(text,text) from public;
revoke all on function public.unlink_hunter_account(text) from public;
revoke all on function public.list_hunter_accounts() from public;
grant execute on function public.supersede_relation(text,jsonb,timestamptz,text) to authenticated;
grant execute on function public.my_access() to authenticated;
grant execute on function public.hunter_workspace() to authenticated;
grant execute on function public.hunter_save(text,jsonb,timestamptz,text) to authenticated;
grant execute on function public.link_hunter_account(text,text) to authenticated;
grant execute on function public.unlink_hunter_account(text) to authenticated;
grant execute on function public.list_hunter_accounts() to authenticated;
commit;
