-- Household seniors come from duties, portrait paths are matched exactly, and anonymous visitors lose direct
-- access to functions meant for signed-in accounts. Run once after 202610040001_standing.sql.
--
-- A duty whose name starts with "Household senior" and names a household is that household's senior appointment.
-- The current one (Active or Acting, no end date, not archived) decides houses.senior; the column is no longer
-- edited directly. Households that already had a senior without such a duty get one, so nothing is lost.
begin;
select set_config('app.change_reason','Household senior taken from duties',true);

create function private.is_senior_duty(duty_name text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(duty_name ~* '^\s*household senior([^[:alnum:]_]|$)',false);
$$;

create function private.house_senior(house_id text) returns text language sql stable security definer set search_path='' as $$
 select d.member from public.duties d
  where d.house=house_id and not d.archived and d.status in ('Active','Acting') and d."end" is null and private.is_senior_duty(d.name)
  order by d.start desc nulls last,d.updated_at desc,d.id limit 1;
$$;

-- Records the senior a household already had as an appointment, for households without a current senior duty.
create function private.record_senior_duty(house_id text) returns void language plpgsql security definer set search_path='' as $$
declare h public.houses;
begin
 select * into h from public.houses where id=house_id;
 if h.id is null or h.archived or h.senior is null or private.house_senior(h.id) is not null then return; end if;
 insert into public.duties(id,archived,published,name,member,house,status,mandate)
  values('DUT-'||gen_random_uuid(),false,h.published,'Household senior of '||h.name,h.senior,h.id,'Active','Recorded as household senior before appointments were kept as duties.');
end; $$;

select private.record_senior_duty(id) from public.houses where senior is not null and not archived;
set constraints all immediate;

-- Archived households keep the senior they had when archived.
create function private.derive_house_senior() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.archived then new.senior:=private.house_senior(new.id); end if;
 return new;
end; $$;
create trigger derive_senior before insert or update on public.houses for each row execute function private.derive_house_senior();

create function private.sync_house_senior() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.houses h set senior=private.house_senior(h.id)
  where h.id in (new.house,case when TG_OP='UPDATE' then old.house end) and not h.archived and h.senior is distinct from private.house_senior(h.id);
 return null;
end; $$;
create trigger sync_house_senior after insert or update on public.duties for each row execute function private.sync_house_senior();

-- Import keeps legacy seniors by recording them as appointments for the households it adds.
create or replace function public.import_archive(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare kind text; item jsonb; clean jsonb; cols text; added_id text; counts jsonb:='{}'; total integer; seniors jsonb:='{}'; senior_id text;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(982734);
 perform set_config('app.change_reason','Legacy workbook import',true);
 for kind in select unnest(array['clans','relations','members','houses','hunts','chronicle','duties','library','settings','promotions','glossary']) loop
  total:=0;
  select string_agg(format('%I',column_name),',' order by ordinal_position) into cols from information_schema.columns where table_schema='public' and table_name=kind;
  for item in select value from jsonb_array_elements(coalesce(payload->kind,'[]')) loop
   select jsonb_object_agg(key,case when value='""'::jsonb then 'null'::jsonb else value end) into clean from jsonb_each(item);
   clean:=jsonb_build_object('archived',false,'player_public',false,'created_at',now(),'updated_at',now())||clean||jsonb_build_object('published',false);
   added_id:=null;
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(id) do nothing returning id',kind,cols,cols,kind) into added_id using clean;
   if added_id is not null then
    total:=total+1;
    if kind='houses' and clean->>'senior' is not null then seniors:=seniors||jsonb_build_object(added_id,clean->>'senior'); end if;
   end if;
  end loop;
  counts:=counts||jsonb_build_object(kind,total);
 end loop;
 -- Senior duties from the workbook are already in place; only seniors without one become an appointment.
 total:=0;
 -- Archived households keep the senior they were imported with.
 for added_id,senior_id in select key,value#>>'{}' from jsonb_each(seniors) loop
  if private.house_senior(added_id) is null and exists(select 1 from public.houses where id=added_id and not archived) then
   insert into public.duties(id,archived,published,name,member,house,status,mandate)
    select 'DUT-'||gen_random_uuid(),false,false,'Household senior of '||h.name,senior_id,h.id,'Active','Recorded as household senior before appointments were kept as duties.' from public.houses h where h.id=added_id;
   total:=total+1;
  end if;
 end loop;
 return counts||jsonb_build_object('senior_duties',total);
end; $$;

-- Member IDs can contain LIKE wildcards; compare the folder prefix exactly.
create or replace function public.can_upload_portrait(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.hunter_accounts a join private.profiles p on p.user_id=a.user_id join public.members m on m.id=a.member
  where a.user_id=(select auth.uid()) and p.status='approved' and not m.archived
   and left(object_name,length(a.member)+1)=a.member||'/' and length(object_name)>length(a.member)+1
   and strpos(object_name,'..')=0 and strpos(substr(object_name,length(a.member)+2),'/')=0);
$$;

revoke all on function private.is_senior_duty(text) from public;
revoke all on function private.house_senior(text) from public;
revoke all on function private.record_senior_duty(text) from public;
revoke all on function private.derive_house_senior() from public;
revoke all on function private.sync_house_senior() from public;

-- Supabase grants execute on new public functions to anon directly, not only through PUBLIC. Every function below
-- already refuses anonymous callers itself; this removes the grant as well. Public reads stay available.
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
  and p.proname not in ('public_archive','is_admin','username_available','recent_changes') loop
  execute format('revoke execute on function %s from anon',f);
 end loop;
end $$;
commit;
