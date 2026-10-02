-- Initial schema. Run once through Supabase migrations or the SQL editor.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.administrators(user_id uuid primary key references auth.users(id));
alter table private.administrators enable row level security;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.administrators where user_id=(select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon,authenticated;
create table public.audit_log(id bigint generated always as identity primary key, changed_at timestamptz not null default now(), actor uuid, kind text not null, record_id text not null, operation text not null, before_data jsonb, after_data jsonb, reason text);
alter table public.audit_log enable row level security;
create policy admin_audit_read on public.audit_log for select to authenticated using (public.is_admin());
revoke all on public.audit_log from anon,authenticated;
grant select on public.audit_log to authenticated;
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(actor,kind,record_id,operation,before_data,after_data,reason) values(auth.uid(),TG_TABLE_NAME,new.id,TG_OP,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),current_setting('app.change_reason',true));
 return new;
end; $$;
create function private.stamp_record() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then new.id:=old.id; new.created_at:=old.created_at; end if;
 new.updated_at:=clock_timestamp(); return new;
end; $$;
create table public.clans(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "kind" text check (("kind" is not null and length(trim("kind"))>0) and ("kind" is null or "kind" in ('Yautja clan','Outsider faction'))),
 "notes" text,
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')));
alter table public.clans enable row level security;
revoke all on public.clans from anon,authenticated;
grant select on public.clans to authenticated;
create policy admin_read on public.clans for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.clans for each row execute function private.audit_change();
create trigger stamp before update on public.clans for each row execute function private.stamp_record();
create table public.relations(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "from" text check (("from" is not null and length(trim("from"))>0)),
 "to" text check (("to" is not null and length(trim("to"))>0)),
 "stance" text check (("stance" is not null and length(trim("stance"))>0) and ("stance" is null or "stance" in ('Unknown','Allied','Friendly','Neutral','Rival','Hostile','War'))),
 "notes" text,
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')));
alter table public.relations enable row level security;
revoke all on public.relations from anon,authenticated;
grant select on public.relations to authenticated;
create policy admin_read on public.relations for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.relations for each row execute function private.audit_change();
create trigger stamp before update on public.relations for each row execute function private.stamp_record();
create table public.members(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "epithet" text,
 "player" text,
 "rank" text check (("rank" is not null and length(trim("rank"))>0) and ("rank" is null or "rank" in ('Unblooded','Young Blood','Blooded','Elite','Elder','Leader','Ancient'))),
 "house" text,
 "sponsor" text,
 "status" text check (("status" is not null and length(trim("status"))>0) and ("status" is null or "status" in ('Active','On leave','Missing','Deceased','Departed'))),
 "joined" date,
 "biography" text,
 "appearance" text,
 "hooks" text,
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')),
 player_public boolean not null default false);
alter table public.members enable row level security;
revoke all on public.members from anon,authenticated;
grant select on public.members to authenticated;
create policy admin_read on public.members for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.members for each row execute function private.audit_change();
create trigger stamp before update on public.members for each row execute function private.stamp_record();
create table public.houses(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "meaning" text,
 "senior" text,
 "vessel" text,
 "status" text check (("status" is not null and length(trim("status"))>0) and ("status" is null or "status" in ('Active','Dispersed','Dissolved'))),
 "history" text,
 "identity" text);
alter table public.houses enable row level security;
revoke all on public.houses from anon,authenticated;
grant select on public.houses to authenticated;
create policy admin_read on public.houses for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.houses for each row execute function private.audit_change();
create trigger stamp before update on public.houses for each row execute function private.stamp_record();
create table public.hunts(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "hunter" text check (("hunter" is not null and length(trim("hunter"))>0)),
 "witness" text,
 "date" date,
 "era" text,
 "quarry" text check (("quarry" is not null and length(trim("quarry"))>0)),
 "weapon" text check (("weapon" is not null and length(trim("weapon"))>0)),
 "limits" text,
 "state" text check (("state" is not null and length(trim("state"))>0) and ("state" is null or "state" in ('Planned','Declared','Underway','Completed','Withdrawn','Invalidated'))),
 "outside" text check (("outside" is not null and length(trim("outside"))>0) and ("outside" is null or "outside" in ('Unknown','No','Yes'))),
 "review" text check (("review" is not null and length(trim("review"))>0) and ("review" is null or "review" in ('Pending','Accepted','Rejected'))),
 "trophy" text,
 "account" text,
 "judgment" text,
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')));
alter table public.hunts enable row level security;
revoke all on public.hunts from anon,authenticated;
grant select on public.hunts to authenticated;
create policy admin_read on public.hunts for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.hunts for each row execute function private.audit_change();
create trigger stamp before update on public.hunts for each row execute function private.stamp_record();
create table public.chronicle(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "era" text,
 "order" numeric check (("order" is not null)),
 "date" date,
 "category" text check (("category" is not null and length(trim("category"))>0) and ("category" is null or "category" in ('Origins','Expedition','Succession','Judgment','Loss','Treaty','Personal account','Other'))),
 "member" text,
 "house" text,
 "hunt" text,
 "certainty" text check (("certainty" is not null and length(trim("certainty"))>0) and ("certainty" is null or "certainty" in ('Recorded','Corroborated','Reconstructed','Disputed','Oral tradition'))),
 "summary" text,
 "body" text check (("body" is not null and length(trim("body"))>0)),
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')));
alter table public.chronicle enable row level security;
revoke all on public.chronicle from anon,authenticated;
grant select on public.chronicle to authenticated;
create policy admin_read on public.chronicle for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.chronicle for each row execute function private.audit_change();
create trigger stamp before update on public.chronicle for each row execute function private.stamp_record();
create table public.duties(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "member" text check (("member" is not null and length(trim("member"))>0)),
 "house" text,
 "start" date,
 "end" date,
 "status" text check (("status" is not null and length(trim("status"))>0) and ("status" is null or "status" in ('Active','Acting','Ended'))),
 "mandate" text check (("mandate" is not null and length(trim("mandate"))>0)));
alter table public.duties enable row level security;
revoke all on public.duties from anon,authenticated;
grant select on public.duties to authenticated;
create policy admin_read on public.duties for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.duties for each row execute function private.audit_change();
create trigger stamp before update on public.duties for each row execute function private.stamp_record();
create table public.library(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "category" text check (("category" is not null and length(trim("category"))>0)),
 "order" numeric check (("order" is not null)),
 "summary" text,
 "url" text check (("url" is not null and length(trim("url"))>0) and ("url" is null or "url"='' or "url" ~* '^https?://[^[:space:]]+$')));
alter table public.library enable row level security;
revoke all on public.library from anon,authenticated;
grant select on public.library to authenticated;
create policy admin_read on public.library for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.library for each row execute function private.audit_change();
create trigger stamp before update on public.library for each row execute function private.stamp_record();
create table public.settings(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "subtitle" text,
 "welcome" text,
 "dossierUrl" text check (("dossierUrl" is null or "dossierUrl"='' or "dossierUrl" ~* '^https?://[^[:space:]]+$')),
 "rulesUrl" text check (("rulesUrl" is null or "rulesUrl"='' or "rulesUrl" ~* '^https?://[^[:space:]]+$')));
alter table public.settings enable row level security;
revoke all on public.settings from anon,authenticated;
grant select on public.settings to authenticated;
create policy admin_read on public.settings for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.settings for each row execute function private.audit_change();
create trigger stamp before update on public.settings for each row execute function private.stamp_record();
alter table public.relations add constraint relations_from_fk foreign key ("from") references public.clans(id) deferrable initially deferred;
alter table public.relations add constraint relations_to_fk foreign key ("to") references public.clans(id) deferrable initially deferred;
alter table public.members add constraint members_house_fk foreign key ("house") references public.houses(id) deferrable initially deferred;
alter table public.members add constraint members_sponsor_fk foreign key ("sponsor") references public.members(id) deferrable initially deferred;
alter table public.houses add constraint houses_senior_fk foreign key ("senior") references public.members(id) deferrable initially deferred;
alter table public.hunts add constraint hunts_hunter_fk foreign key ("hunter") references public.members(id) deferrable initially deferred;
alter table public.hunts add constraint hunts_witness_fk foreign key ("witness") references public.members(id) deferrable initially deferred;
alter table public.chronicle add constraint chronicle_member_fk foreign key ("member") references public.members(id) deferrable initially deferred;
alter table public.chronicle add constraint chronicle_house_fk foreign key ("house") references public.houses(id) deferrable initially deferred;
alter table public.chronicle add constraint chronicle_hunt_fk foreign key ("hunt") references public.hunts(id) deferrable initially deferred;
alter table public.duties add constraint duties_member_fk foreign key ("member") references public.members(id) deferrable initially deferred;
alter table public.duties add constraint duties_house_fk foreign key ("house") references public.houses(id) deferrable initially deferred;
alter table public.relations add check ("from"<>"to");
create unique index relations_direction on public.relations("from","to") where not archived;
alter table public.members add check (sponsor is null or sponsor<>id);
alter table public.hunts add check (witness is null or hunter<>witness);
alter table public.duties add check ("end" is null or start is null or "end">=start);
create unique index settings_singleton on public.settings ((true));
create function private.check_sponsors() returns trigger language plpgsql set search_path='' as $$
declare cursor_id text; seen text[];
begin
 cursor_id:=new.sponsor; seen:=array[new.id];
 while cursor_id is not null loop
  if cursor_id=any(seen) then raise exception 'Sponsor cycle detected'; end if;
  seen:=array_append(seen,cursor_id);
  select sponsor into cursor_id from public.members where id=cursor_id;
 end loop;
 return new;
end; $$;
create constraint trigger sponsor_cycle after insert or update on public.members deferrable initially deferred for each row execute function private.check_sponsors();
create function public.public_archive() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 return result;
end; $$;
revoke all on function public.public_archive() from public;
grant execute on function public.public_archive() to anon,authenticated;
create function public.save_record(record_kind text,payload jsonb,expected_updated timestamptz,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare current_updated timestamptz; col_list text; update_list text; clean jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if record_kind not in ('clans','relations','members','houses','hunts','chronicle','duties','library','settings') then raise exception 'Invalid record type'; end if;
 if length(trim(coalesce(change_reason,'')))=0 then raise exception 'Change reason is required'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason',change_reason,true);
 execute format('select updated_at from public.%I where id=$1 for update',record_kind) into current_updated using payload->>'id';
 if current_updated is distinct from expected_updated then raise exception 'Record changed since it was opened. Reload before saving.' using errcode='40001'; end if;
 clean:=payload - array['created_at','updated_at'];
 select jsonb_object_agg(key,case when value='""'::jsonb then 'null'::jsonb else value end) into clean from jsonb_each(clean);
 select string_agg(format('%I',column_name),',' order by ordinal_position),string_agg(format('%I=excluded.%I',column_name,column_name),',' order by ordinal_position) into col_list,update_list from information_schema.columns where table_schema='public' and table_name=record_kind and column_name not in ('created_at','updated_at');
 -- Populate explicit metadata so INSERT constraints are met, preserve creation on updates.
 clean:=jsonb_build_object('archived',false,'published',false,'player_public',false)||clean;
 execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set %s',record_kind,col_list,col_list,record_kind,update_list) using clean;
end; $$;
revoke all on function public.save_record(text,jsonb,timestamptz,text) from public;
grant execute on function public.save_record(text,jsonb,timestamptz,text) to authenticated;
-- Import preserves legacy IDs and timestamps; existing rows are never overwritten.
create function public.import_archive(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare kind text; item jsonb; clean jsonb; cols text; inserted integer; counts jsonb:='{}'; total integer;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason','Legacy workbook import',true);
 for kind in select unnest(array['clans','relations','members','houses','hunts','chronicle','duties','library','settings']) loop
  total:=0;
  select string_agg(format('%I',column_name),',' order by ordinal_position) into cols from information_schema.columns where table_schema='public' and table_name=kind;
  for item in select value from jsonb_array_elements(coalesce(payload->kind,'[]')) loop
   select jsonb_object_agg(key,case when value='""'::jsonb then 'null'::jsonb else value end) into clean from jsonb_each(item);
   clean:=jsonb_build_object('archived',false,'player_public',false,'created_at',now(),'updated_at',now())||clean||jsonb_build_object('published',false);
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(id) do nothing',kind,cols,cols,kind) using clean;
   get diagnostics inserted=row_count; total:=total+inserted;
  end loop;
  counts:=counts||jsonb_build_object(kind,total);
 end loop;
 return counts;
end; $$;
revoke all on function public.import_archive(jsonb) from public;
grant execute on function public.import_archive(jsonb) to authenticated;
commit;
