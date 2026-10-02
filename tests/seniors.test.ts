import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { emptyData,rankLabel,validate,type RecordData } from '../src/model';

const row=(id:string,extra:Partial<RecordData>={}):RecordData=>({id,name:id,archived:false,published:true,...extra});

describe('household senior appointments',()=>{
 it('needs a household and allows one current senior per household',()=>{
  const d=emptyData();d.houses=[row('h')];d.members=[row('a'),row('b')];
  d.duties=[row('d1',{name:'Household senior of h',member:'a',house:'h',status:'Active',mandate:'M'})];
  expect(validate('duties',row('d2',{name:'Household senior',member:'b',status:'Active',mandate:'M'}),d)).toContain('A household senior appointment needs a household.');
  expect(validate('duties',row('d2',{name:'Household senior',member:'b',house:'h',status:'Active',mandate:'M'}),d)).toContain('This household already has a current household senior. End that appointment first.');
  expect(validate('duties',row('d2',{name:'Household senior',member:'b',house:'h',status:'Ended',end:'2026-01-01',mandate:'M'}),d)).toEqual([]);
  expect(validate('duties',{...d.duties[0],member:'b'},d)).toEqual([]);
 });
 it('shows warrior rank and senior standing together',()=>{
  expect([rankLabel(row('k',{rank:'Elite',standing:'Ancient'})),rankLabel(row('s',{standing:'Ancient'})),rankLabel(row('b',{rank:'Blooded'}))]).toEqual(['Elite · Ancient','Ancient','Blooded']);
 });
});

const db=new PGlite();
const ids={admin:'11111111-1111-4111-8111-111111111111',hunter:'22222222-2222-4222-8222-222222222222',wild:'33333333-3333-4333-8333-333333333333'};
async function as(role:string,id:string=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const save=(kind:string,payload:any,stamp:string|null=null)=>db.query('select public.save_record($1,$2::jsonb,$3::timestamptz,$4)',[kind,JSON.stringify(payload),stamp,'Setup']);
const raw=async(kind:string,id:string)=>{await db.exec('reset role');return (await db.query<any>(`select * from public.${kind} where id=$1`,[id])).rows[0];};
const seniorDuties=async(house:string)=>{await db.exec('reset role');return (await db.query<any>("select member,status,published from public.duties where house=$1 and name ilike 'household senior%' order by created_at",[house])).rows;};

beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 for(const id of Object.values(ids))await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@private.test`]);
 for(const f of ['202610020001_archive.sql','202610030001_hunters.sql','202610030002_accounts_forum.sql','202610030003_community.sql','202610040001_standing.sql'])await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 await db.exec(`insert into private.administrators values('${ids.admin}')`);
 await as('authenticated',ids.admin);
 // Before the migration: one household with a senior and a matching duty, one with a senior and no duty, one archived.
 for(const [id,name] of [['m1','Keth’tar'],['m2','Thar’jek'],['m3','Third'],['m_x','Wildcard']])await save('members',{id,name,rank:'Elite',status:'Active',published:true});
 await save('houses',{id:'vek',name:'Vek’ta',status:'Active',senior:'m1',published:true});
 await save('houses',{id:'khe',name:'Khe’rat',status:'Active',senior:'m2',published:true});
 await save('houses',{id:'old',name:'Old house',status:'Dissolved',senior:'m3',archived:true,published:true});
 await save('duties',{id:'d-vek',name:'Household Senior For Vek’ta',member:'m1',house:'vek',status:'Active',mandate:'Leads the household.',published:true});
 await db.query('select public.review_account($1,$2,$3)',[ids.hunter,'approved','m1']);
 await db.query('select public.review_account($1,$2,$3)',[ids.wild,'approved','m_x']);
 await db.exec('reset role');
 // Supabase's default privileges grant anon execute on every public function; the migration has to take it back.
 await db.exec('grant execute on all functions in schema public to anon');
 await db.exec(fs.readFileSync('supabase/migrations/202610050001_household_seniors.sql','utf8'));
});
afterAll(async()=>await db.close());

describe('household senior migration',()=>{
 it('records existing seniors without a duty as appointments and leaves matched and archived households alone',async()=>{
  expect(await seniorDuties('vek')).toEqual([{member:'m1',status:'Active',published:true}]);
  expect(await seniorDuties('khe')).toEqual([{member:'m2',status:'Active',published:true}]);
  expect(await seniorDuties('old')).toEqual([]);
  expect([(await raw('houses','vek')).senior,(await raw('houses','khe')).senior,(await raw('houses','old')).senior]).toEqual(['m1','m2','m3']);
 });
 it('ignores a senior set directly on the household',async()=>{
  await as('authenticated',ids.admin);
  const house=await raw('houses','vek');await as('authenticated',ids.admin);
  await save('houses',{...house,senior:'m2'},house.updated_at.toISOString());
  expect((await raw('houses','vek')).senior).toBe('m1');
 });
 it('follows the current senior duty when it ends or changes hands',async()=>{
  await as('authenticated',ids.admin);
  let duty=await raw('duties','d-vek');await as('authenticated',ids.admin);
  await save('duties',{...duty,status:'Ended',end:'2026-10-01'},duty.updated_at.toISOString());
  expect((await raw('houses','vek')).senior).toBeNull();
  await as('authenticated',ids.admin);
  await save('duties',{id:'d-vek-2',name:'Household senior of Vek’ta',member:'m2',house:'vek',status:'Acting',mandate:'Acting senior.',published:true});
  expect((await raw('houses','vek')).senior).toBe('m2');
  duty=await raw('duties','d-vek-2');await as('authenticated',ids.admin);
  await save('duties',{...duty,house:'khe'},duty.updated_at.toISOString());
  expect([(await raw('houses','vek')).senior,(await raw('houses','khe')).senior]).toEqual([null,'m2']);
 });
 it('gives household permissions to the hunter holding the current duty',async()=>{
  await as('authenticated',ids.admin);
  await save('duties',{id:'d-vek-3',name:'Household senior',member:'m1',house:'vek',status:'Active',mandate:'Leads again.',published:true});
  await as('authenticated',ids.hunter);
  expect((await db.query<any>('select public.my_access() as a')).rows[0].a.seniorOf).toEqual(['vek']);
 });
 it('keeps legacy seniors on import as unpublished appointments, once',async()=>{
  await as('authenticated',ids.admin);
  const fixture={houses:[{id:'imp',name:'Imported',status:'Active',senior:'m3'}]};
  const first=(await db.query<any>('select public.import_archive($1) as c',[JSON.stringify(fixture)])).rows[0].c;
  expect([first.houses,first.senior_duties]).toEqual([1,1]);
  expect((await raw('houses','imp')).senior).toBe('m3');
  expect(await seniorDuties('imp')).toEqual([{member:'m3',status:'Active',published:false}]);
  await as('authenticated',ids.admin);
  const second=(await db.query<any>('select public.import_archive($1) as c',[JSON.stringify(fixture)])).rows[0].c;
  expect([second.houses,second.senior_duties]).toEqual([0,0]);
 });
});

describe('hardening',()=>{
 it('matches the portrait folder exactly, so an underscore in an ID is not a wildcard',async()=>{
  await as('authenticated',ids.wild);
  const can=async(path:string)=>(await db.query<any>('select public.can_upload_portrait($1) as ok',[path])).rows[0].ok;
  expect([await can('m_x/a.png'),await can('mAx/a.png'),await can('m_x/'),await can('m_x/a/b.png'),await can('m_x/../m1/a.png')]).toEqual([true,false,false,false,false]);
 });
 it('anonymous visitors keep only the public functions',async()=>{
  await as('anon');
  expect((await db.query<any>('select public.public_archive() as d')).rows[0].d).toHaveProperty('members');
  await expect(db.query('select public.my_queue()')).rejects.toThrow(/permission denied/);
  await db.exec('reset role');
  const can=async(fn:string)=>(await db.query<any>("select has_function_privilege('anon',$1,'execute') as ok",[fn])).rows[0].ok;
  expect([await can('public.recent_changes(integer)'),await can('public.username_available(text)'),await can('public.hunter_save(text,jsonb,timestamptz,text)'),await can('public.forum_threads()')]).toEqual([true,true,false,false]);
 });
});
