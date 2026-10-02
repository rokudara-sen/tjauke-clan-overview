import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db=new PGlite();
const ids={admin:'11111111-1111-4111-8111-111111111111',legacy:'22222222-2222-4222-8222-222222222222',newbie:'33333333-3333-4333-8333-333333333333',other:'44444444-4444-4444-8444-444444444444',spammer:'55555555-5555-4555-8555-555555555555'};
async function as(role:string,id:string=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const one=async(sql:string,params:unknown[]=[])=>(await db.query<any>(sql,params)).rows[0];
const register=async(id:string,meta:object)=>{await db.exec('reset role');await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${id}@private.test`,JSON.stringify(meta)]);};
const review=(account:string,decision:string,member:string|null=null)=>db.query('select public.review_account($1,$2,$3)',[account,decision,member]);
const post=(thread:string,body:string)=>db.query('select public.forum_post($1,$2)',[thread,body]);
const thread=async(id:string)=>(await one('select public.forum_thread($1) as t',[id])).t;

beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[ids.admin,'admin@private.test',ids.legacy,'legacy@private.test']);
 for(const f of ['202610020001_archive.sql','202610030001_hunters.sql'])await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 await db.exec(`insert into private.administrators values('${ids.admin}')`);
 await as('authenticated',ids.admin);
 await db.query('select public.save_record($1,$2,null,$3)',['members',JSON.stringify({id:'hunter',name:'Hunter',rank:'Blooded',status:'Active',published:true}),'Setup']);
 await db.query('select public.link_hunter_account($1,$2)',['legacy@private.test','hunter']);
 await db.exec('reset role');
 await db.exec(fs.readFileSync('supabase/migrations/202610030002_accounts_forum.sql','utf8'));
});
afterAll(async()=>await db.close());

describe('registration',()=>{
 it('keeps existing accounts approved and their hunter links intact, without usernames yet',async()=>{
  await as('authenticated',ids.legacy);expect((await one('select public.my_access() as a')).a).toMatchObject({status:'approved',username:null,member:'hunter'});
 });
 it('creates a pending profile with the requested username, note and hunter',async()=>{
  await register(ids.newbie,{username:'Night_Stalker',note:'I play Hunter',member:'hunter'});
  await as('authenticated',ids.newbie);expect((await one('select public.my_access() as a')).a).toMatchObject({status:'pending',username:'Night_Stalker',member:null});
 });
 it('rejects taken usernames regardless of case, and malformed ones',async()=>{
  await as('anon');expect((await one('select public.username_available($1) as ok',['night_stalker'])).ok).toBe(false);expect((await one('select public.username_available($1) as ok',['a b'])).ok).toBe(false);expect((await one('select public.username_available($1) as ok',['Fresh-name'])).ok).toBe(true);
  await expect(register(ids.other,{username:'NIGHT_STALKER'})).rejects.toThrow(/duplicate key|unique/);
  await register(ids.other,{username:'Other.one',member:'not-a-hunter'});await db.exec('reset role');expect((await one('select requested_member from private.profiles where user_id=$1',[ids.other])).requested_member).toBeNull();
 });
 it('lets an account without a username claim one exactly once',async()=>{
  await as('authenticated',ids.legacy);await expect(db.query('select public.claim_username($1)',['other.ONE'])).rejects.toThrow(/taken/);
  await db.query('select public.claim_username($1)',['Veteran']);await expect(db.query('select public.claim_username($1)',['Again'])).rejects.toThrow(/already has/);
 });
 it('lists accounts for administrators only and never returns emails',async()=>{
  await as('authenticated',ids.newbie);await expect(db.query('select public.list_accounts()')).rejects.toThrow(/Administrator approval/);
  await as('authenticated',ids.admin);const list=(await one('select public.list_accounts() as l')).l;expect(JSON.stringify(list)).not.toContain('@private.test');expect(list[0]).toMatchObject({status:'pending'});
 });
 it('pending accounts cannot be linked to a hunter or use the forum',async()=>{
  await db.exec('reset role');await expect(db.query('insert into private.hunter_accounts values($1,$2)',[ids.newbie,'hunter'])).rejects.toThrow(/Approve the account/);
  await as('authenticated',ids.newbie);await expect(db.query('select public.forum_threads()')).rejects.toThrow(/approved accounts/);
 });
 it('approving links the hunter; one hunter per account; suspending removes the link',async()=>{
  await as('authenticated',ids.admin);await expect(review(ids.newbie,'approved','hunter')).rejects.toThrow(/already linked/);
  await expect(review(ids.admin,'suspended')).rejects.toThrow(/own account/);
  await review(ids.legacy,'suspended');await as('authenticated',ids.legacy);expect((await one('select public.my_access() as a')).a).toMatchObject({status:'suspended',member:null});
  await as('authenticated',ids.admin);await review(ids.newbie,'approved','hunter');await as('authenticated',ids.newbie);expect((await one('select public.my_access() as a')).a).toMatchObject({status:'approved',member:'hunter'});
  await as('authenticated',ids.admin);await review(ids.other,'approved');
 });
});

describe('forum',()=>{
 let id='';
 it('approved accounts start threads and post; authors show username and hunter, never email',async()=>{
  await as('authenticated',ids.newbie);id=(await one('select public.forum_create_thread($1,$2) as id',['Hunt planning','First message'])).id;
  await as('authenticated',ids.other);await post(id,'Reply');
  const t=await thread(id);expect(t.messages.map((m:any)=>[m.username,m.body,m.mine,m.can_delete])).toEqual([['Night_Stalker','First message',false,false],['Other.one','Reply',true,true]]);
  expect(t.messages[0]).toMatchObject({member:'hunter',member_name:'Hunter'});expect(JSON.stringify(t)).not.toContain('@private.test');
 });
 it('suspended and anonymous users cannot read',async()=>{await as('authenticated',ids.legacy);await expect(db.query('select public.forum_threads()')).rejects.toThrow(/approved accounts/);await as('anon');await expect(db.query('select public.forum_threads()')).rejects.toThrow(/permission denied/);});
 it('only the author or an administrator deletes a message',async()=>{
  await as('authenticated',ids.newbie);const [first,reply]=(await thread(id)).messages;
  await as('anon');await expect(db.query('select public.forum_delete_message($1)',[first.id])).rejects.toThrow(/permission denied/);
  await as('authenticated',ids.other);await expect(db.query('select public.forum_delete_message($1)',[first.id])).rejects.toThrow(/your own/);
  await db.query('select public.forum_delete_message($1)',[reply.id]);expect((await thread(id)).messages).toHaveLength(1);
 });
 it('keeps only the newest messages up to the thread cap',async()=>{
  await as('authenticated',ids.admin);await db.query('select public.forum_configure($1,$2)',[30,5]);
  await as('authenticated',ids.other);for(let i=1;i<=6;i++)await post(id,`m${i}`);
  const t=await thread(id);expect(t.messages.map((m:any)=>m.body)).toEqual(['m2','m3','m4','m5','m6']);expect(t.settings).toEqual({retention_days:30,thread_cap:5});
 });
 it('deletes messages past the retention period and removes threads left empty',async()=>{
  await as('authenticated',ids.newbie);const old=(await one('select public.forum_create_thread($1,$2) as id',['Old thread','Old'])).id;
  await db.exec('reset role');await db.query("update private.forum_messages set created_at=now()-interval '31 days' where thread=$1 or body='m2'",[old]);await db.query("update private.forum_threads set last_post_at=now()-interval '31 days' where id=$1",[old]);
  await as('authenticated',ids.newbie);const list=(await one('select public.forum_threads() as f')).f;
  expect(list.threads.map((t:any)=>t.title)).toEqual(['Hunt planning']);expect((await thread(id)).messages.map((m:any)=>m.body)).toEqual(['m3','m4','m5','m6']);
 });
 it('locked threads refuse posts except from administrators; admins delete threads',async()=>{
  await as('authenticated',ids.admin);await db.query('select public.forum_moderate($1,$2)',[id,'lock']);
  await as('authenticated',ids.newbie);await expect(post(id,'blocked')).rejects.toThrow(/locked/);await expect(db.query('select public.forum_moderate($1,$2)',[id,'unlock'])).rejects.toThrow(/Administrator approval/);
  await as('authenticated',ids.admin);await db.query('select public.claim_username($1)',['Admin']);await post(id,'Admin note');
  await db.query('select public.forum_moderate($1,$2)',[id,'delete']);await expect(db.query('select public.forum_thread($1)',[id])).rejects.toThrow(/no longer exists/);
 });
 it('requires a username to post and limits posting rate',async()=>{
  await db.exec('reset role');await db.query('insert into auth.users(id,email) values($1,$2)',[ids.spammer,'s@private.test']);
  await as('authenticated',ids.admin);await review(ids.spammer,'approved');
  await as('authenticated',ids.spammer);await expect(db.query('select public.forum_create_thread($1,$2)',['x','y'])).rejects.toThrow(/Choose a username/);
  await db.query('select public.claim_username($1)',['Fast']);const t=(await one('select public.forum_create_thread($1,$2) as id',['Fast','1'])).id;
  for(let i=2;i<=10;i++)await post(t,String(i));await expect(post(t,'11')).rejects.toThrow(/too quickly/);
 });
 it('rejects empty and oversized messages',async()=>{await as('authenticated',ids.newbie);const t=(await one('select public.forum_create_thread($1,$2) as id',['Limits','ok'])).id;await expect(post(t,'   ')).rejects.toThrow(/check/);await expect(post(t,'x'.repeat(2001))).rejects.toThrow(/check/);});
});
