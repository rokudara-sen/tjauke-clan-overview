import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {openHunts,readyForJudgment,undertakingStatus,type RecordData} from '../src/model';

const db=new PGlite();
const hunter='11111111-1111-4111-8111-111111111111',elder='22222222-2222-4222-8222-222222222222';
const migration='202610110001_undertaking_declarations.sql';
async function as(id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function read(id:string){await db.exec('reset role');return (await db.query<any>('select * from public.hunts where id=$1',[id])).rows[0];}
const save=(payload:any,updated:string|null=null)=>db.query('select public.hunter_save($1,$2::jsonb,$3::timestamptz,$4)',['hunts',JSON.stringify(payload),updated,'Test declaration']);
const declaration=(id:string,state='Declared')=>({id,name:id,hunter:'hunter',quarry:'Serpent',weapon:'Spear',state,outside:'No'});
async function queue(){await as(elder);return (await db.query<any>('select public.my_queue() as q')).rows[0].q.judgments;}
beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
 for(const f of fs.readdirSync('supabase/migrations').sort().filter(f=>f!==migration))await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 await db.exec(`insert into auth.users(id,email) values('${hunter}','hunter@example.test'),('${elder}','elder@example.test');
 insert into public.members(id,name,rank,standing,status,published) values('hunter','Hunter','Blooded',null,'Active',true),('elder','Elder','Elite','Elder','Active',true);
 update private.profiles set status='approved' where user_id in ('${hunter}','${elder}');
 insert into private.hunter_accounts(user_id,member) values('${hunter}','hunter'),('${elder}','elder');
 insert into public.hunts(id,name,hunter,quarry,weapon,state,outside,review) values('HNT-existing','Existing','hunter','Q','W','Declared','No','Pending');`);
 await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
});
afterAll(async()=>await db.close());
it('labels open undertakings by state, not by the pending claim default',()=>{
 const row={...declaration('test'),archived:false,published:true,review:'Pending'} as RecordData;
 expect(undertakingStatus(row)).toBe('Declared');expect(readyForJudgment(row)).toBe(false);
 expect(openHunts([row])).toHaveLength(1);
 expect(undertakingStatus({...row,state:'Completed',account:'Returned account'})).toBe('Awaiting judgment');
 expect(readyForJudgment({...row,state:'Completed',account:'  '})).toBe(false);
 expect(undertakingStatus({...row,state:'Withdrawn'})).toBe('Withdrawn');
});
it('keeps old private declarations private until the owner saves them',async()=>{
 const old=await read('HNT-existing');expect(old.published).toBe(false);
 await as(hunter);await save(old,old.updated_at.toISOString());
 expect((await read(old.id)).published).toBe(true);
});
it('publishes declarations without accepting claims or placing them in the judgment queue',async()=>{
 await as(hunter);await save({...declaration('HNT-new'),review:'Accepted'});
 expect(await read('HNT-new')).toMatchObject({published:true,review:'Pending'});
 expect(await queue()).toBe(0);
 const workspace=(await db.query<any>('select public.hunter_workspace() as w')).rows[0].w;
 expect(workspace.hunts).toEqual([]);
 await db.exec('reset role; set role anon');
 const archive=(await db.query<any>('select public.public_archive() as d')).rows[0].d;
 expect(openHunts(archive.hunts).map(h=>h.id)).toContain('HNT-new');
});
it('keeps plans private and publishes them when declared',async()=>{
 await as(hunter);await save(declaration('HNT-plan','Planned'));
 const plan=await read('HNT-plan');expect(plan.published).toBe(false);
 await as(hunter);await save({...plan,state:'Declared'},plan.updated_at.toISOString());
 expect((await read(plan.id)).published).toBe(true);
});
it('requires a returned account and keeps self-judgment forbidden',async()=>{
 const h=await read('HNT-new');await as(hunter);
 await expect(save({...h,state:'Completed'},h.updated_at.toISOString())).rejects.toThrow(/returned account/);
 await expect(save({...h,review:'Accepted'},h.updated_at.toISOString())).rejects.toThrow(/cannot change: review/);
 await as(elder);await expect(save({...h,review:'Accepted'},h.updated_at.toISOString())).rejects.toThrow(/returned account/);
 await as(hunter);await save({...h,state:'Completed',account:'Returned without assistance.'},h.updated_at.toISOString());
 expect(await queue()).toBe(1);
 const workspace=(await db.query<any>('select public.hunter_workspace() as w')).rows[0].w;
 expect(workspace.hunts.map((r:any)=>r.id)).toEqual(['HNT-new']);
 const done=workspace.hunts[0];await save({...done,review:'Accepted',judgment:'Account accepted.'},done.updated_at);
 expect(await queue()).toBe(0);
 const judged=await read(done.id);await as(hunter);
 await expect(save({...judged,account:'Changed'},judged.updated_at.toISOString())).rejects.toThrow(/has been judged/);
});
