-- Trophy hall: a curated selection of significant trophies, separate from every claim recorded on an undertaking.
-- Run once after 202610060001_standing_not_earned.sql. Additive: no existing record is changed.
begin;

create table public.trophies(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 "name" text check (("name" is not null and length(trim("name"))>0)),
 "description" text check (("description" is not null and length(trim("description"))>0)),
 "hunter" text check (("hunter" is not null and length(trim("hunter"))>0)),
 "origin" text check (("origin" is not null and length(trim("origin"))>0) and ("origin" is null or "origin" in ('Taken on a hunt','Awarded','Gifted','Inherited'))),
 "hunt" text,
 "quarry" text,
 "date" date,
 "era" text,
 "significance" text,
 "kept" text,
 "order" numeric,
 "image" text check (("image" is null or "image"='' or "image" ~* '^https?://[^[:space:]]+$')),
 "source" text check (("source" is null or "source"='' or "source" ~* '^https?://[^[:space:]]+$')));
alter table public.trophies enable row level security;
revoke all on public.trophies from anon,authenticated;
grant select on public.trophies to authenticated;
create policy admin_read on public.trophies for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.trophies for each row execute function private.audit_change();
create trigger stamp before update on public.trophies for each row execute function private.stamp_record();
alter table public.trophies add constraint trophies_hunter_fk foreign key ("hunter") references public.members(id) deferrable initially deferred;
alter table public.trophies add constraint trophies_hunt_fk foreign key ("hunt") references public.hunts(id) deferrable initially deferred;

-- A trophy that cites an undertaking must be that hunter's, and the claim must have been judged Accepted.
create function private.check_trophy() returns trigger language plpgsql security definer set search_path='' as $$
declare h public.hunts;
begin
 if new.hunt is null or new.archived then return new; end if;
 select * into h from public.hunts where id=new.hunt;
 if h.id is null then return new; end if;
 if h.hunter is distinct from new.hunter then raise exception 'The undertaking belongs to a different hunter.'; end if;
 if h.review is distinct from 'Accepted' then raise exception 'Only an undertaking whose claim was judged Accepted can supply a trophy.'; end if;
 return new;
end; $$;
create trigger check_trophy before insert or update on public.trophies for each row execute function private.check_trophy();
revoke all on function private.check_trophy() from public;

create or replace function public.public_archive() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}';
begin
 select result || jsonb_build_object('clans',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.clans t where published;
 select result || jsonb_build_object('relations',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.relations t where published;
 select result || jsonb_build_object('members',coalesce(jsonb_agg(case when t.player_public then to_jsonb(t)-array['created_at','updated_at','player_public'] else to_jsonb(t)-array['created_at','updated_at','player_public','player'] end), '[]'::jsonb)) into result from public.members t where published;
 select result || jsonb_build_object('houses',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.houses t where published;
 select result || jsonb_build_object('hunts',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.hunts t where published;
 select result || jsonb_build_object('trophies',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.trophies t where published;
 select result || jsonb_build_object('chronicle',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.chronicle t where published;
 select result || jsonb_build_object('duties',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.duties t where published;
 select result || jsonb_build_object('library',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.library t where published;
 select result || jsonb_build_object('settings',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.settings t where published;
 select result || jsonb_build_object('promotions',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.promotions t where published;
 select result || jsonb_build_object('glossary',coalesce(jsonb_agg(to_jsonb(t)-array['created_at','updated_at']), '[]'::jsonb)) into result from public.glossary t where published;
 return result;
end; $$;

create or replace function public.save_record(record_kind text,payload jsonb,expected_updated timestamptz,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare current_updated timestamptz;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if record_kind not in ('clans','relations','members','houses','hunts','trophies','chronicle','duties','library','settings','promotions','glossary') then raise exception 'Invalid record type'; end if;
 if length(trim(coalesce(change_reason,'')))=0 then raise exception 'Change reason is required'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason',change_reason,true);
 execute format('select updated_at from public.%I where id=$1 for update',record_kind) into current_updated using payload->>'id';
 if current_updated is distinct from expected_updated then raise exception 'Record changed since it was opened. Reload before saving.' using errcode='40001'; end if;
 perform private.write_record(record_kind,payload);
end; $$;

create or replace function public.recent_changes(max_rows integer default 8) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare entry record; found_name text; is_archived boolean; result jsonb:='[]'; taken integer:=0;
begin
 for entry in select * from (select distinct on (a.kind,a.record_id) a.kind,a.record_id,a.changed_at,a.operation,a.before_data,a.after_data from public.audit_log a
  where a.kind in ('clans','relations','members','houses','hunts','trophies','chronicle','duties','library','promotions','glossary') order by a.kind,a.record_id,a.id desc) latest order by latest.changed_at desc limit 200 loop
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
commit;
