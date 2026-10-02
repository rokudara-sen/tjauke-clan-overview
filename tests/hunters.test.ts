import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db=new PGlite();
const ids={admin:'11111111-1111-4111-8111-111111111111',senior:'22222222-2222-4222-8222-222222222222',young:'33333333-3333-4333-8333-333333333333',elder:'44444444-4444-4444-8444-444444444444',leader:'55555555-5555-4555-8555-555555555555',stranger:'66666666-6666-4666-8666-666666666666',other:'77777777-7777-4777-8777-777777777777'};
async function as(role:string,id:string=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const adminSave=(kind:string,payload:any,stamp:string|null=null)=>db.query('select public.save_record($1,$2::jsonb,$3::timestamptz,$4)',[kind,JSON.stringify(payload),stamp,'Test setup']);
const hunterSave=(kind:string,payload:any,stamp:string|null=null)=>db.query('select public.hunter_save($1,$2::jsonb,$3::timestamptz,$4)',[kind,JSON.stringify(payload),stamp,'Hunter edit']);
async function raw(kind:string,id:string){await db.exec('reset role');const r=(await db.query<any>(`select * from public.${kind} where id=$1`,[id])).rows[0];return r;}
const stamp=(r:any)=>r.updated_at.toISOString();
const workspace=async(id:string)=>{await as('authenticated',id);return (await db.query<any>('select public.hunter_workspace() as w')).rows[0].w;};

beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users values($1,$2)',[id,`${name}@example.test`]);
 await db.exec(fs.readFileSync('supabase/migrations/202610020001_archive.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610030001_hunters.sql','utf8'));
 await db.exec(`insert into private.administrators values('${ids.admin}')`);
 await as('authenticated',ids.admin);
 const member=(id:string,rank:string,house:string)=>adminSave('members',{id,name:id,rank,status:'Active',house,published:true});
 await adminSave('houses',{id:'h1',name:'First house',status:'Active',published:true});
 await adminSave('houses',{id:'h2',name:'Second house',status:'Active',published:true});
 await member('senior','Elite','h1');await member('young','Blooded','h1');await member('elder','Elder','h2');await member('leader','Leader','h2');await member('other','Blooded','h2');
 const h1=await raw('houses','h1');await as('authenticated',ids.admin);await adminSave('houses',{...h1,senior:'senior'},stamp(h1));
 for(const name of ['senior','young','elder','leader','other'])await db.query('select public.link_hunter_account($1,$2)',[`${name}@example.test`,name]);
 await adminSave('hunts',{id:'HNT-other',name:'Second house hunt',hunter:'other',quarry:'Q',weapon:'W',state:'Declared',outside:'No',review:'Pending',published:true});
});
afterAll(async()=>await db.close());

describe('hunter accounts',()=>{
 it('reports access derived from rank and household seniority',async()=>{
  await as('authenticated',ids.senior);expect((await db.query<any>('select public.my_access() as a')).rows[0].a).toMatchObject({admin:false,member:'senior',elder:false,seniorOf:['h1']});
  await as('authenticated',ids.elder);expect((await db.query<any>('select public.my_access() as a')).rows[0].a).toMatchObject({member:'elder',elder:true,seniorOf:[]});
  await as('authenticated',ids.stranger);expect((await db.query<any>('select public.my_access() as a')).rows[0].a).toMatchObject({admin:false,member:null});
 });
 it('only administrators link accounts, and one account per hunter',async()=>{
  await as('authenticated',ids.young);await expect(db.query('select public.link_hunter_account($1,$2)',['stranger@example.test','senior'])).rejects.toThrow(/Administrator approval/);
  await as('authenticated',ids.admin);await expect(db.query('select public.link_hunter_account($1,$2)',['stranger@example.test','senior'])).rejects.toThrow(/already linked/);
  await as('anon');await expect(hunterSave('members',{id:'young'})).rejects.toThrow(/permission denied/);
  await as('authenticated',ids.stranger);await expect(hunterSave('members',{id:'young'})).rejects.toThrow(/No hunter record/);
 });
 it('hunters still cannot read raw tables',async()=>{await as('authenticated',ids.young);expect((await db.query('select * from public.members')).rows).toEqual([]);expect((await db.query('select * from public.audit_log')).rows).toEqual([]);});
});

describe('own profile',()=>{
 it('edits own prose live and audits the hunter as actor',async()=>{
  const me=(await workspace(ids.young)).member;await hunterSave('members',{...me,biography:'Written by the player'},me.updated_at);
  const r=await raw('members','young');expect(r).toMatchObject({biography:'Written by the player',published:true,rank:'Blooded'});
  expect((await db.query<any>("select actor from public.audit_log where record_id='young' order by id desc limit 1")).rows[0].actor).toBe(ids.young);
 });
 it('refuses rank, household and other hunters\' records',async()=>{
  let me=(await workspace(ids.young)).member;await expect(hunterSave('members',{...me,rank:'Ancient'},me.updated_at)).rejects.toThrow(/cannot change: rank/);
  await expect(hunterSave('members',{...me,published:false},me.updated_at)).rejects.toThrow(/cannot change: published/);
  const other=await raw('members','senior');await as('authenticated',ids.young);await expect(hunterSave('members',{...other,biography:'x',updated_at:undefined},stamp(other))).rejects.toThrow(/own hunter record/);
 });
 it('rejects stale profile edits',async()=>{await as('authenticated',ids.young);await expect(hunterSave('members',{id:'young',biography:'stale'},'2020-01-01T00:00:00Z')).rejects.toThrow(/changed since/);});
});

describe('households',()=>{
 it('the senior edits household prose; others cannot',async()=>{
  const h=(await workspace(ids.senior)).houses[0];await hunterSave('houses',{...h,history:'Senior account'},h.updated_at);expect((await raw('houses','h1')).history).toBe('Senior account');
  const fresh=await raw('houses','h1');await as('authenticated',ids.senior);await expect(hunterSave('houses',{...fresh,senior:'young'},stamp(fresh))).rejects.toThrow(/cannot change: senior/);
  const h2=await raw('houses','h2');await as('authenticated',ids.elder);await expect(hunterSave('houses',{...h2,history:'x'},stamp(h2))).rejects.toThrow(/household senior/);
 });
});

describe('undertakings',()=>{
 const declaration={id:'HNT-young',name:'Young hunt',hunter:'young',quarry:'Quarry',weapon:'Spear',state:'Declared',outside:'No'};
 it('declares own undertakings as unpublished drafts pending judgment',async()=>{
  await as('authenticated',ids.young);
  await expect(hunterSave('hunts',{...declaration,hunter:'senior'})).rejects.toThrow(/own undertakings/);
  await expect(hunterSave('hunts',{...declaration,state:'Completed'})).rejects.toThrow(/Planned or Declared/);
  await hunterSave('hunts',{...declaration,published:true,review:'Accepted'});
  expect(await raw('hunts','HNT-young')).toMatchObject({published:false,review:'Pending',hunter:'young'});
 });
 it('the hunter updates the account but cannot judge it',async()=>{
  const h=(await workspace(ids.young)).hunts.find((h:any)=>h.id==='HNT-young');
  await hunterSave('hunts',{...h,state:'Completed',account:'What happened'},h.updated_at);
  const h2=await raw('hunts','HNT-young');await as('authenticated',ids.young);
  await expect(hunterSave('hunts',{...h2,review:'Accepted'},stamp(h2))).rejects.toThrow(/cannot change: review/);
  await expect(hunterSave('hunts',{...h2,state:'Invalidated'},stamp(h2))).rejects.toThrow(/Only a judge/);
 });
 it('the household senior judges and publishes; then the hunter is locked out',async()=>{
  const h=(await workspace(ids.senior)).hunts.find((h:any)=>h.id==='HNT-young');expect(h).toBeTruthy();
  await expect(hunterSave('hunts',{...h,quarry:'Changed'},h.updated_at)).rejects.toThrow(/cannot change: quarry/);
  await hunterSave('hunts',{...h,review:'Accepted',judgment:'Witnessed',published:true},h.updated_at);
  expect(await raw('hunts','HNT-young')).toMatchObject({review:'Accepted',published:true,account:'What happened'});
  const after=await raw('hunts','HNT-young');await as('authenticated',ids.young);await expect(hunterSave('hunts',{...after,account:'Rewrite'},stamp(after))).rejects.toThrow(/has been judged/);
 });
 it('a senior cannot judge outside the household; an elder can judge anywhere',async()=>{
  expect((await workspace(ids.senior)).hunts.some((h:any)=>h.id==='HNT-other')).toBe(false);
  const h=await raw('hunts','HNT-other');await as('authenticated',ids.senior);await expect(hunterSave('hunts',{...h,review:'Rejected'},stamp(h))).rejects.toThrow(/cannot judge/);
  const seen=(await workspace(ids.elder)).hunts.find((h:any)=>h.id==='HNT-other');await hunterSave('hunts',{...seen,review:'Rejected',judgment:'No witness'},seen.updated_at);
  expect((await raw('hunts','HNT-other')).review).toBe('Rejected');
 });
});

describe('history',()=>{
 const entry={id:'HIS-elder',name:'Elder entry',order:3,category:'Other',certainty:'Recorded',body:'Account'};
 it('only Elder and above add history, always as drafts',async()=>{
  await as('authenticated',ids.young);await expect(hunterSave('chronicle',entry)).rejects.toThrow(/Only Elder/);
  await as('authenticated',ids.elder);await hunterSave('chronicle',{...entry,published:true});expect((await raw('chronicle','HIS-elder')).published).toBe(false);
 });
 it('the author cannot publish their own entry; another elder can, then it is locked',async()=>{
  const mine=(await workspace(ids.elder)).chronicle.find((c:any)=>c.id==='HIS-elder');expect(mine.mine).toBe(true);
  await expect(hunterSave('chronicle',{...mine,published:true},mine.updated_at)).rejects.toThrow(/cannot change: published/);
  const theirs=(await workspace(ids.leader)).chronicle.find((c:any)=>c.id==='HIS-elder');expect(theirs.mine).toBe(false);
  await hunterSave('chronicle',{...theirs,published:true},theirs.updated_at);expect((await raw('chronicle','HIS-elder')).published).toBe(true);
  const pub=await raw('chronicle','HIS-elder');await as('authenticated',ids.leader);await expect(hunterSave('chronicle',{...pub,body:'x'},stamp(pub))).rejects.toThrow(/administrator/);
 });
 it('hunters cannot edit politics, duties or rank history',async()=>{await as('authenticated',ids.elder);for(const kind of ['relations','duties','promotions','glossary'])await expect(hunterSave(kind,{id:'x'})).rejects.toThrow(/cannot edit this record type/);});
});

describe('administrator additions',()=>{
 it('archiving a hunter removes their account access',async()=>{
  const r=await raw('members','other');await as('authenticated',ids.admin);await adminSave('members',{...r,archived:true},stamp(r));
  await as('authenticated',ids.other);await expect(db.query('select public.hunter_workspace()')).rejects.toThrow(/No hunter record/);
 });
 it('supersedes an assessment atomically and keeps the earlier one',async()=>{
  await as('authenticated',ids.admin);await adminSave('clans',{id:'a',name:'A',kind:'Yautja clan',published:true});await adminSave('clans',{id:'b',name:'B',kind:'Yautja clan',published:true});
  await adminSave('relations',{id:'r1',name:'First',from:'a',to:'b',stance:'Hostile',assessed:'2026-01-01',published:true});
  const old=await raw('relations','r1');await as('authenticated',ids.admin);
  await expect(db.query('select public.supersede_relation($1,$2,$3,$4)',['r1',JSON.stringify({id:'r2',name:'Second',from:'b',to:'a',stance:'Neutral'}),stamp(old),'Changed'])).rejects.toThrow(/same direction/);
  await db.query('select public.supersede_relation($1,$2,$3,$4)',['r1',JSON.stringify({id:'r2',name:'Second',from:'a',to:'b',stance:'Neutral',assessed:'2026-09-01',published:true}),stamp(old),'Changed']);
  await as('anon');const rel=(await db.query<any>('select public.public_archive() as d')).rows[0].d.relations;
  expect(rel.map((r:any)=>[r.id,r.archived,r.stance])).toEqual(expect.arrayContaining([['r1',true,'Hostile'],['r2',false,'Neutral']]));
 });
 it('publishes rank history and glossary through the public projection',async()=>{
  await as('authenticated',ids.admin);
  await adminSave('promotions',{id:'PRM-1',name:'Blooded',member:'young',rank:'Blooded',hunt:'HNT-young',published:true});
  await adminSave('glossary',{id:'GLS-1',name:'Term',meaning:'Working meaning',status:'Provisional',published:true});
  await adminSave('glossary',{id:'GLS-2',name:'Draft',meaning:'Hidden',status:'Provisional'});
  await as('anon');const d=(await db.query<any>('select public.public_archive() as d')).rows[0].d;
  expect(d.promotions.map((r:any)=>r.id)).toEqual(['PRM-1']);expect(d.glossary.map((r:any)=>r.id)).toEqual(['GLS-1']);expect(d.glossary[0]).not.toHaveProperty('created_at');
 });
});
