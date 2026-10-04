import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111',player='22222222-2222-4222-8222-222222222222',late='33333333-3333-4333-8333-333333333333';
async function as(role:string,id:string=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const one=async(sql:string,params:unknown[]=[])=>(await db.query<any>(sql,params)).rows[0];
const register=async(id:string,meta:object)=>{await db.exec('reset role');await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${id}@private.test`,JSON.stringify(meta)]);};
const save=(kind:string,payload:object)=>db.query('select public.save_record($1,$2::jsonb,null,$3)',[kind,JSON.stringify(payload),'Test']);

describe('taken hunters',()=>{
 beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await db.query('insert into auth.users(id,email) values($1,$2)',[admin,'admin@private.test']);
  for(const f of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
  await db.exec(`insert into private.administrators values('${admin}')`);
  await as('authenticated',admin);
  await save('members',{id:'k',name:'Keth’tar',rank:'Elite',status:'Active',published:true});
  await save('members',{id:'x',name:'Other',rank:'Blooded',status:'Active',published:true});
  await register(player,{username:'Player',member:'k'});
  await as('authenticated',admin);await db.query('select public.review_account($1,$2,$3)',[player,'approved','k']);
 });
 afterAll(async()=>await db.close());

 it('tells visitors which hunters already have an account, and nothing else',async()=>{
  await as('anon');
  expect((await one('select public.hunters_taken() as t')).t).toEqual(['k']);
 });
 it('drops a registration request for a hunter someone already plays',async()=>{
  await register(late,{username:'Latecomer',member:'k'});
  expect((await one('select requested_member from private.profiles where user_id=$1',[late])).requested_member).toBeNull();
  await db.exec('delete from auth.users where id=\''+late+'\'');
  await register(late,{username:'Latecomer',member:'x'});
  expect((await one('select requested_member from private.profiles where user_id=$1',[late])).requested_member).toBe('x');
 });
});
