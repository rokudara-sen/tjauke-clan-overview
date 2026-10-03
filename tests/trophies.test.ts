import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { emptyData,hallTrophies,validate,type RecordData } from '../src/model';

const row=(id:string,extra:Partial<RecordData>={}):RecordData=>({id,name:id,archived:false,published:true,...extra});
const trophy=(id:string,extra:Partial<RecordData>={})=>row(id,{description:'D',hunter:'k',origin:'Taken on a hunt',...extra});

describe('trophy hall',()=>{
 it('orders by display order, then newest, with unordered entries last',()=>{
  const d=emptyData();d.trophies=[trophy('late',{date:'2026-05-01'}),trophy('early',{date:'2026-01-01'}),trophy('zero',{order:'0'}),trophy('two',{order:'2'}),trophy('gone',{order:'1',archived:true})];
  expect(hallTrophies(d).map(t=>t.id)).toEqual(['zero','two','late','early']);
 });
 it('hides an entry whose undertaking is no longer an accepted claim of the same hunter',()=>{
  const d=emptyData();d.hunts=[row('ok',{hunter:'k',review:'Accepted'}),row('rejected',{hunter:'k',review:'Rejected'}),row('other',{hunter:'x',review:'Accepted'})];
  d.trophies=[trophy('a',{hunt:'ok'}),trophy('b',{hunt:'rejected'}),trophy('c',{hunt:'other'}),trophy('d',{origin:'Gifted'}),trophy('e',{hunt:'unpublished'})];
  expect(hallTrophies(d).map(t=>t.id).sort()).toEqual(['a','d','e']);
 });
 it('validates the cited undertaking',()=>{
  const d=emptyData();d.members=[row('k'),row('x')];d.hunts=[row('ok',{hunter:'k',review:'Accepted'}),row('pending',{hunter:'k',review:'Pending'})];
  expect(validate('trophies',trophy('t',{hunt:'ok'}),d)).toEqual([]);
  expect(validate('trophies',trophy('t',{hunt:'ok',hunter:'x'}),d)).toContain('The undertaking belongs to a different hunter.');
  expect(validate('trophies',trophy('t',{hunt:'pending'}),d)).toContain('Only an undertaking whose claim was judged Accepted can supply a trophy.');
  expect(validate('trophies',trophy('t',{hunt:'pending',archived:true}),d)).toEqual([]);
  expect(validate('trophies',row('t'),d)).toEqual(expect.arrayContaining(['What it is is required.','Hunted or earned by is required.','How it was earned is required.']));
 });
});

const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111',visitor='22222222-2222-4222-8222-222222222222';
async function as(role:string,id:string=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const save=(kind:string,payload:any,stamp:string|null=null)=>db.query('select public.save_record($1,$2::jsonb,$3::timestamptz,$4)',[kind,JSON.stringify(payload),stamp,'Test']);
const archive=async()=>(await db.query<any>('select public.public_archive() as data')).rows[0].data;

describe('trophy hall migration',()=>{
 beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for(const id of [admin,visitor])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@private.test`]);
  for(const f of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
  await db.exec(`insert into private.administrators values('${admin}')`);
  await as('authenticated',admin);
  await save('members',{id:'k',name:'Keth’tar',rank:'Elite',status:'Active',published:true});
  await save('members',{id:'x',name:'Other',rank:'Blooded',status:'Active',published:true});
  await save('hunts',{id:'ok',name:'Ash Ravine',hunter:'k',quarry:'Q',weapon:'W',state:'Completed',outside:'No',review:'Accepted',published:true});
  await save('hunts',{id:'pending',name:'Unjudged',hunter:'k',quarry:'Q',weapon:'W',state:'Completed',outside:'No',review:'Pending',published:true});
 });
 afterAll(async()=>await db.close());

 it('publishes only published trophies to visitors',async()=>{
  await as('authenticated',admin);
  await save('trophies',{id:'t1',name:'Skull',description:'D',hunter:'k',origin:'Taken on a hunt',hunt:'ok',order:0,published:true});
  await save('trophies',{id:'t2',name:'Draft',description:'D',hunter:'k',origin:'Gifted'});
  await as('anon');
  expect((await archive()).trophies.map((t:any)=>t.id)).toEqual(['t1']);
  await expect(db.query('select * from public.trophies')).rejects.toThrow(/permission denied/);
 });
 it('refuses a pending claim or another hunter’s undertaking',async()=>{
  await as('authenticated',admin);
  await expect(save('trophies',{id:'t3',name:'Spine',description:'D',hunter:'k',origin:'Taken on a hunt',hunt:'pending'})).rejects.toThrow(/judged Accepted/);
  await expect(save('trophies',{id:'t3',name:'Spine',description:'D',hunter:'x',origin:'Taken on a hunt',hunt:'ok'})).rejects.toThrow(/different hunter/);
  await expect(save('trophies',{id:'t3',name:'Spine',description:'D',hunter:'k',origin:'Found'})).rejects.toThrow(/check constraint/);
 });
 it('refuses writes from a signed-in visitor who is not an administrator',async()=>{
  await as('authenticated',visitor);
  await expect(save('trophies',{id:'t4',name:'X',description:'D',hunter:'k',origin:'Gifted'})).rejects.toThrow(/Administrator approval required/);
 });
});
