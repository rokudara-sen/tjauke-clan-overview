-- Warrior caste rank and senior standing become separate fields; undertakings record their context.
-- Run once after 202610030003_community.sql.
-- Hunters ranked Elder, Leader or Ancient keep that as standing (Leader becomes Clan Leader). Their warrior
-- caste rank before senior standing is left unrecorded rather than guessed; an administrator can fill it in.
begin;
select set_config('app.change_reason','Split senior standing from warrior caste rank',true);

alter table public.members drop constraint if exists members_rank_check;
alter table public.members add column "standing" text;
update public.members set "standing"=case "rank" when 'Elder' then 'Elder' when 'Leader' then 'Clan Leader' else 'Ancient' end,"rank"=null where "rank" in ('Elder','Leader','Ancient');
-- The updates queue deferred foreign-key checks; run them now so the tables can be altered again.
set constraints all immediate;
alter table public.members add constraint members_rank_check check ("rank" is null or "rank" in ('Unblooded','Young Blood','Blooded','Elite'));
alter table public.members add constraint members_standing_check check ("standing" is null or "standing" in ('Elder','Clan Leader','Ancient'));
alter table public.members add constraint members_rank_or_standing check ("rank" is not null or "standing" is not null);

-- Rank history becomes advancement and standing history.
alter table public.promotions drop constraint if exists promotions_rank_check;
update public.promotions set "rank"='Clan Leader' where "rank"='Leader';
set constraints all immediate;
alter table public.promotions add constraint promotions_rank_check check ("rank" is not null and "rank" in ('Unblooded','Young Blood','Blooded','Elite','Elder','Clan Leader','Ancient'));

-- Training hunts and blooding rites are told apart. Existing undertakings stay unrecorded.
alter table public.hunts add column "context" text check ("context" is null or "context" in ('Personal hunt','Training hunt','Blooding rite'));

-- Senior standing, not warrior rank, now grants the Elder permissions.
create or replace function public.my_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me public.members; p private.profiles;
begin
 select * into p from private.profiles where user_id=(select auth.uid());
 select m.* into me from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
 return jsonb_build_object('admin',public.is_admin(),'username',p.username,'status',coalesce(p.status,'pending'),'member',me.id,'name',me.name,'rank',me.rank,'standing',me.standing,
  'elder',me.standing is not null,
  'seniorOf',coalesce((select jsonb_agg(h.id) from public.houses h where h.senior=me.id and not h.archived),'[]'::jsonb));
end; $$;

create or replace function public.hunter_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me public.members; elder boolean;
begin
 select m.* into me from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
 if me.id is null then raise exception 'No hunter record is linked to this account' using errcode='42501'; end if;
 elder:=me.standing is not null;
 return jsonb_build_object(
  'member',to_jsonb(me),
  'houses',coalesce((select jsonb_agg(to_jsonb(h)) from public.houses h where h.senior=me.id and not h.archived),'[]'::jsonb),
  'hunts',coalesce((select jsonb_agg(to_jsonb(h)) from public.hunts h where not h.archived and (h.hunter=me.id or ((h.review='Pending' or not h.published) and (elder or exists(select 1 from public.members m join public.houses s on s.id=m.house where m.id=h.hunter and s.senior=me.id and not s.archived))))),'[]'::jsonb),
  'chronicle',case when elder then coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('mine',private.author('chronicle',c.id) is not distinct from (select auth.uid()))) from public.chronicle c where not c.published and not c.archived),'[]'::jsonb) else '[]'::jsonb end);
end; $$;

-- Same rules as before, with Elder permissions from standing and the undertaking context declared by its hunter.
create or replace function public.hunter_save(record_kind text,payload jsonb,expected_updated timestamptz,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare me public.members; elder boolean; cur jsonb; current_updated timestamptz; allowed text[]; merged jsonb; denied text; judge boolean;
 target text:=payload->>'id'; content text[]:=array['name','era','order','date','category','member','house','hunt','certainty','summary','body','source'];
begin
 select m.* into me from private.hunter_accounts a join public.members m on m.id=a.member where a.user_id=(select auth.uid()) and not m.archived;
 if me.id is null then raise exception 'No hunter record is linked to this account' using errcode='42501'; end if;
 if record_kind not in ('members','houses','hunts','chronicle') then raise exception 'Hunters cannot edit this record type' using errcode='42501'; end if;
 if length(trim(coalesce(change_reason,'')))=0 then raise exception 'Change reason is required'; end if;
 elder:=me.standing is not null;
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
   allowed:=array['name','context','witness','date','era','quarry','weapon','limits','state','outside','source'];
  elsif cur->>'hunter'=me.id then
   if cur->>'review' is distinct from 'Pending' or (cur->>'archived')::boolean then raise exception 'This undertaking has been judged. Ask an administrator to change it.' using errcode='42501'; end if;
   if payload->>'state'='Invalidated' and cur->>'state'<>'Invalidated' then raise exception 'Only a judge can invalidate an undertaking' using errcode='42501'; end if;
   allowed:=array['name','context','witness','date','era','quarry','weapon','limits','state','outside','trophy','account','source'];
  else
   select true into judge from public.members m join public.houses h on h.id=m.house where m.id=cur->>'hunter' and h.senior=me.id and not h.archived;
   if (cur->>'archived')::boolean or not (elder or coalesce(judge,false)) then raise exception 'You cannot judge this undertaking' using errcode='42501'; end if;
   allowed:=array['review','judgment','state','published'];
  end if;
 else
  if not elder then raise exception 'Only hunters with Elder, Clan Leader or Ancient standing can add history' using errcode='42501'; end if;
  if cur is null then
   if coalesce(target,'')!~'^HIS-' then raise exception 'Invalid record ID'; end if;
   cur:=jsonb_build_object('id',target,'archived',false,'published',false);
   allowed:=content;
  elsif (cur->>'published')::boolean or (cur->>'archived')::boolean then raise exception 'Published history can only be changed by an administrator' using errcode='42501';
  elsif private.author('chronicle',target) is not distinct from (select auth.uid()) then allowed:=content;
  else allowed:=content||array['published'];
  end if;
 end if;

 if current_updated is not null then
  select string_agg(key,', ') into denied from jsonb_each(payload) p where key<>all(allowed) and key not in ('id','created_at','updated_at','mine')
   and nullif(p.value#>>'{}','') is distinct from nullif(cur->>key,'');
  if denied is not null then raise exception 'You cannot change: %',denied using errcode='42501'; end if;
 end if;
 select cur||coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into merged from jsonb_each(payload) where key=any(allowed);
 perform private.write_record(record_kind,merged);
end; $$;

-- Only an accepted blooding rite by a hunter not yet Blooded suggests an advancement.
-- Ordinary and training hunts add to a hunter's record but never suggest a rank or standing.
create or replace function private.promotion_candidates() returns setof public.hunts language sql stable security definer set search_path='' as $$
 select h.* from public.hunts h join public.members m on m.id=h.hunter
  where not h.archived and h.review='Accepted' and h.context='Blooding rite'
  and m.standing is null and (m.rank is null or m.rank in ('Unblooded','Young Blood'))
  and not exists(select 1 from public.promotions p where p.hunt=h.id and not p.archived)
  and not exists(select 1 from private.promotion_dismissals d where d.hunt=h.id);
$$;

create or replace function public.my_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); me public.members:=private.my_member(); p private.profiles; elder boolean; result jsonb;
begin
 if uid is null then return '{}'::jsonb; end if;
 select * into p from private.profiles where user_id=uid;
 elder:=me.standing is not null;
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

revoke all on function private.promotion_candidates() from public;
revoke all on function public.my_access() from public;
revoke all on function public.hunter_workspace() from public;
revoke all on function public.hunter_save(text,jsonb,timestamptz,text) from public;
revoke all on function public.my_queue() from public;
grant execute on function public.my_access() to authenticated;
grant execute on function public.hunter_workspace() to authenticated;
grant execute on function public.hunter_save(text,jsonb,timestamptz,text) to authenticated;
grant execute on function public.my_queue() to authenticated;
commit;
