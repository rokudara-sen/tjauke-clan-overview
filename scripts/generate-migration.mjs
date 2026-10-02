import fs from 'node:fs';
const schemas=JSON.parse(fs.readFileSync('src/schema.json','utf8'));
const q=s=>`'${s.replaceAll("'","''")}'`, ident=s=>`"${s}"`;
// Kinds and fields marked "added" belong to later hand-written migrations; this file stays the initial schema.
for(const k of Object.keys(schemas)){if(schemas[k].added)delete schemas[k];else schemas[k].fields=schemas[k].fields.filter(f=>!f.added);}
const tables=Object.keys(schemas);
let sql=`-- Initial schema. Run once through Supabase migrations or the SQL editor.
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
`;
for(const [k,s] of Object.entries(schemas)){
 const cols=s.fields.map(f=>{let type=f.type==='number'?'numeric':f.type==='date'?'date':'text';let checks=[];if(f.required)checks.push(`${ident(f.key)} is not null${type==='text'?` and length(trim(${ident(f.key)}))>0`:''}`);if(f.options)checks.push(`${ident(f.key)} is null or ${ident(f.key)} in (${f.options.map(q).join(',')})`);if(f.type==='url')checks.push(`${ident(f.key)} is null or ${ident(f.key)}='' or ${ident(f.key)} ~* '^https?://[^[:space:]]+$'`);return ` ${ident(f.key)} ${type}${checks.length?` check (${checks.map(x=>`(${x})`).join(' and ')})`:''}`;});
 if(k==='members')cols.push(' player_public boolean not null default false');
 sql+=`create table public.${k}(id text primary key check(length(id)>0),archived boolean not null default false,published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),\n${cols.join(',\n')});\n`;
 sql+=`alter table public.${k} enable row level security;
revoke all on public.${k} from anon,authenticated;
grant select on public.${k} to authenticated;
create policy admin_read on public.${k} for select to authenticated using(public.is_admin());
create trigger audit after insert or update on public.${k} for each row execute function private.audit_change();
create trigger stamp before update on public.${k} for each row execute function private.stamp_record();
`;
}
for(const [k,s]of Object.entries(schemas))for(const f of s.fields.filter(f=>f.ref))sql+=`alter table public.${k} add constraint ${k}_${f.key}_fk foreign key (${ident(f.key)}) references public.${f.ref}(id) deferrable initially deferred;\n`;
sql+=`alter table public.relations add check ("from"<>"to");
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
${tables.map(k=>` select result || jsonb_build_object('${k}',coalesce(jsonb_agg(${k==='members'?`case when t.player_public then to_jsonb(t)-array['created_at','updated_at','player_public'] else to_jsonb(t)-array['created_at','updated_at','player_public','player'] end`:`to_jsonb(t)-array['created_at','updated_at']`}), '[]'::jsonb)) into result from public.${k} t where published;`).join('\n')}
 return result;
end; $$;
revoke all on function public.public_archive() from public;
grant execute on function public.public_archive() to anon,authenticated;
create function public.save_record(record_kind text,payload jsonb,expected_updated timestamptz,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare current_updated timestamptz; col_list text; update_list text; clean jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator approval required' using errcode='42501'; end if;
 if record_kind not in (${tables.map(q).join(',')}) then raise exception 'Invalid record type'; end if;
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
 for kind in select unnest(array[${tables.map(q).join(',')}]) loop
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
`;
fs.writeFileSync('supabase/migrations/202610020001_archive.sql',sql);
