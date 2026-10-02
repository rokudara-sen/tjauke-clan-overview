import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db=new PGlite();
const ids={admin:'11111111-1111-4111-8111-111111111111',hunter:'22222222-2222-4222-8222-222222222222',witness:'33333333-3333-4333-8333-333333333333',reader:'44444444-4444-4444-8444-444444444444',pending:'55555555-5555-4555-8555-555555555555',leaver:'66666666-6666-4666-8666-666666666666'};
async function as(role:string,id:string=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const one=async(sql:string,params:unknown[]=[])=>(await db.query<any>(sql,params)).rows[0];
const val=async(sql:string,params:unknown[]=[])=>Object.values(await one(sql,params))[0] as any;
const save=(kind:string,payload:any,stamp:string|null=null)=>db.query('select public.save_record($1,$2::jsonb,$3::timestamptz,$4)',[kind,JSON.stringify(payload),stamp,'Setup']);
const raw=async(kind:string,id:string)=>{await db.exec('reset role');return one(`select * from public.${kind} where id=$1`,[id]);};
const queue=async(id:string)=>{await as('authenticated',id);return val('select public.my_queue()');};
const hunt=(id:string,extra:object={})=>({id,name:id,hunter:'h-hunter',quarry:'Q',weapon:'W',state:'Declared',outside:'No',review:'Pending',published:true,...extra});

beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 for(const id of [ids.admin,ids.hunter,ids.witness,ids.reader,ids.leaver])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@private.test`]);
 for(const f of ['202610020001_archive.sql','202610030001_hunters.sql'])await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 await db.exec(`insert into private.administrators values('${ids.admin}')`);
 await as('authenticated',ids.admin);
 await save('houses',{id:'house',name:'House',status:'Active',published:true});
 for(const [id,rank] of [['h-hunter','Blooded'],['h-witness','Elite'],['h-leaver','Blooded']])await save('members',{id,name:id,rank,status:'Active',house:'house',published:true});
 await save('hunts',hunt('legacy',{witness:'h-witness'}));
 await db.exec('reset role');
 for(const f of ['202610030002_accounts_forum.sql','202610030003_community.sql'])await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 await as('authenticated',ids.admin);
 for(const [account,member] of [[ids.hunter,'h-hunter'],[ids.witness,'h-witness'],[ids.leaver,'h-leaver']])await db.query('select public.review_account($1,$2,$3)',[account,'approved',member]);
 for(const [id,name] of [[ids.admin,'Admin'],[ids.hunter,'Hunter'],[ids.witness,'Witness'],[ids.reader,'Reader'],[ids.leaver,'Leaver']]){await as('authenticated',id);await db.query('select public.claim_username($1)',[name]);}
 await db.exec('reset role');await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[ids.pending,'p@private.test',JSON.stringify({username:'Waiting'})]);
});
afterAll(async()=>await db.close());

describe('witness confirmation',()=>{
 it('does not assume legacy witnesses confirmed',async()=>expect((await raw('hunts','legacy')).witness_status).toBeNull());
 it('asks a newly named witness, who alone can answer',async()=>{
  await as('authenticated',ids.admin);await save('hunts',hunt('h1',{witness:'h-witness'}));expect((await raw('hunts','h1')).witness_status).toBe('Requested');
  await as('authenticated',ids.hunter);await expect(db.query('select public.respond_witness($1,$2)',['h1',true])).rejects.toThrow(/not the witness/);
  await as('authenticated',ids.witness);expect((await val('select public.witness_requests()')).map((r:any)=>[r.id,r.witness_status])).toEqual([['h1','Requested'],['legacy',null]]);
  await db.query('select public.respond_witness($1,$2)',['h1',true]);expect((await raw('hunts','h1')).witness_status).toBe('Confirmed');
  expect(await val("select reason from public.audit_log where record_id='h1' order by id desc limit 1")).toBe('Witness confirmed');
 });
 it('asks again when the witness changes, and closes once judged',async()=>{
  let h=await raw('hunts','h1');await as('authenticated',ids.admin);await save('hunts',{...h,witness:'h-leaver'},h.updated_at.toISOString());expect((await raw('hunts','h1')).witness_status).toBe('Requested');
  h=await raw('hunts','h1');await as('authenticated',ids.admin);await save('hunts',{...h,witness:'h-witness',review:'Accepted',state:'Completed'},h.updated_at.toISOString());
  await as('authenticated',ids.witness);await expect(db.query('select public.respond_witness($1,$2)',['h1',false])).rejects.toThrow(/already been judged/);
 });
});

describe('pending work counts',()=>{
 it('counts witness requests for hunters and hides administrator counts from them',async()=>{
  await as('authenticated',ids.admin);await save('hunts',hunt('h2',{witness:'h-witness'}));
  const q=await queue(ids.witness);expect(q).toMatchObject({witness:1,mentions:0});expect(q).not.toHaveProperty('registrations');
 });
 it('counts registrations, suggestions and promotion candidates for administrators',async()=>{expect(await queue(ids.admin)).toMatchObject({registrations:1,promotions:1,portraits:0,reports:0,suggestions:0});});
});

describe('promotion suggestions',()=>{
 it('lists accepted claims until a promotion cites them or they are dismissed',async()=>{
  await as('authenticated',ids.admin);expect((await val('select public.promotion_suggestions()')).map((s:any)=>s.hunt)).toEqual(['h1']);
  await save('hunts',hunt('h3',{review:'Accepted',state:'Completed'}));await save('promotions',{id:'p1',name:'Blooded',member:'h-hunter',rank:'Blooded',hunt:'h1'});
  expect((await val('select public.promotion_suggestions()')).map((s:any)=>s.hunt)).toEqual(['h3']);
  await db.query('select public.dismiss_promotion($1)',['h3']);expect(await val('select public.promotion_suggestions()')).toEqual([]);
  await as('authenticated',ids.hunter);await expect(db.query('select public.promotion_suggestions()')).rejects.toThrow(/Administrator approval/);
 });
});

describe('glossary suggestions',()=>{
 it('approved accounts suggest provisional drafts, up to five waiting',async()=>{
  await as('authenticated',ids.pending);await expect(db.query('select public.suggest_term($1,$2,$3,$4)',['T','M','',''])).rejects.toThrow(/approved accounts/);
  await as('authenticated',ids.hunter);for(let i=1;i<=5;i++)await db.query('select public.suggest_term($1,$2,$3,$4)',[`Term ${i}`,'Meaning','','']);
  await expect(db.query('select public.suggest_term($1,$2,$3,$4)',['Term 6','M','',''])).rejects.toThrow(/5 suggestions waiting/);
  const mine=await val('select public.my_suggestions()');expect(mine).toHaveLength(5);expect(mine[0]).toMatchObject({published:false});
  await db.exec('reset role');expect(await val("select count(*)::int from public.glossary where status='Provisional' and not published")).toBe(5);
  expect((await queue(ids.admin)).suggestions).toBe(5);
 });
});

describe('portraits',()=>{
 it('allows uploads only into the hunter\'s own folder',async()=>{
  await as('authenticated',ids.hunter);
  for(const [path,ok] of [['h-hunter/a.png',true],['h-witness/a.png',false],['h-hunter/x/a.png',false],['h-hunter/../a.png',false]])expect(await val('select public.can_upload_portrait($1)',[path])).toBe(ok);
  await as('authenticated',ids.reader);expect(await val('select public.can_upload_portrait($1)',['h-hunter/a.png'])).toBe(false);
 });
 it('replaces a pending upload, and approval publishes the URL on the record',async()=>{
  await as('authenticated',ids.hunter);expect(await val('select public.submit_portrait($1)',['h-hunter/one.png'])).toEqual([]);
  expect(await val('select public.submit_portrait($1)',['h-hunter/two.png'])).toEqual(['h-hunter/one.png']);
  expect(await val('select public.my_portrait()')).toMatchObject({status:'pending',path:'h-hunter/two.png'});
  await expect(db.query('select public.pending_portraits()')).rejects.toThrow(/Administrator approval/);
  await as('authenticated',ids.admin);const [p]=await val('select public.pending_portraits()');expect(p).toMatchObject({member:'h-hunter',path:'h-hunter/two.png'});
  await expect(db.query('select public.decide_portrait($1,true,$2)',[p.id,'javascript:x'])).rejects.toThrow(/public portrait URL/);
  await db.query('select public.decide_portrait($1,true,$2)',[p.id,'https://cdn.example/portraits/h-hunter/two.png']);
  expect((await raw('members','h-hunter')).portrait).toBe('https://cdn.example/portraits/h-hunter/two.png');
  await as('anon');expect((await val('select public.public_archive()')).members.find((m:any)=>m.id==='h-hunter').portrait).toContain('two.png');
 });
});

describe('forum additions',()=>{
 let t='';
 it('tracks unread messages per account and clears them on reading',async()=>{
  await as('authenticated',ids.hunter);t=await val('select public.forum_create_thread($1,$2)',['Plans','Hello @Witness. And @nobody here']);
  expect((await val('select public.forum_threads()')).threads[0]).toMatchObject({unread:0});
  await as('authenticated',ids.witness);expect((await val('select public.forum_threads()')).threads[0]).toMatchObject({unread:1,mentioned:true});
  expect(await queue(ids.witness)).toMatchObject({mentions:1,unread:1});
  await as('authenticated',ids.witness);await db.query('select public.forum_thread($1)',[t]);expect(await queue(ids.witness)).toMatchObject({mentions:0,unread:0});
 });
 it('only mentions approved accounts, not the author',async()=>{
  await as('authenticated',ids.hunter);await db.query('select public.forum_post($1,$2)',[t,'@Hunter @Waiting @witness-']);
  await db.exec('reset role');expect(await val('select count(*)::int from private.forum_mentions')).toBe(2);
 });
 it('reports go to administrators; own messages cannot be reported',async()=>{
  await as('authenticated',ids.hunter);const msgs=(await val('select public.forum_thread($1)',[t])).messages;
  await expect(db.query('select public.forum_report($1,$2)',[msgs[0].id,'mine'])).rejects.toThrow(/own message/);
  await as('authenticated',ids.witness);await db.query('select public.forum_report($1,$2)',[msgs[0].id,'Off topic']);
  expect((await val('select public.forum_thread($1)',[t])).messages[0].reported).toBe(true);
  await expect(db.query('select public.forum_reports()')).rejects.toThrow(/Administrator approval/);
  await as('authenticated',ids.admin);const [r]=await val('select public.forum_reports()');expect(r).toMatchObject({author:'Hunter',reporter:'Witness',reason:'Off topic',title:'Plans'});
  expect((await queue(ids.admin)).reports).toBe(1);await as('authenticated',ids.admin);await db.query('select public.forum_resolve_report($1)',[r.id]);expect(await val('select public.forum_reports()')).toEqual([]);
 });
 it('pinned threads keep old messages and sort first, but still respect the cap',async()=>{
  await as('authenticated',ids.witness);const other=await val('select public.forum_create_thread($1,$2)',['Other','Newer']);
  await as('authenticated',ids.admin);await db.query('select public.forum_moderate($1,$2)',[t,'pin']);await db.query('select public.forum_configure($1,$2)',[30,5]);
  await db.exec('reset role');await db.query("update private.forum_messages set created_at=now()-interval '60 days'");await db.query("update private.forum_threads set last_post_at=now()-interval '60 days'");
  await as('authenticated',ids.witness);const list=(await val('select public.forum_threads()')).threads;
  expect(list.map((x:any)=>[x.title,x.pinned,x.messages])).toEqual([['Plans',true,2]]);
  for(let i=1;i<=5;i++)await db.query('select public.forum_post($1,$2)',[t,`n${i}`]);
  expect((await val('select public.forum_thread($1)',[t])).messages.map((m:any)=>m.body)).toEqual(['n1','n2','n3','n4','n5']);
  expect(other).toBeTruthy();
 });
});

describe('account self-service',()=>{
 it('administrators rename accounts; names stay unique',async()=>{
  await as('authenticated',ids.admin);await expect(db.query('select public.rename_account($1,$2)',[ids.reader,'witness'])).rejects.toThrow(/taken/);
  await db.query('select public.rename_account($1,$2)',[ids.reader,'READER']);await db.query('select public.rename_account($1,$2)',[ids.reader,'Reader2']);
  await as('authenticated',ids.reader);expect((await val('select public.my_access()')).username).toBe('Reader2');
  await expect(db.query('select public.rename_account($1,$2)',[ids.reader,'Self'])).rejects.toThrow(/Administrator approval/);
 });
 it('deletes an account after typing the username, keeping messages without an author',async()=>{
  await as('authenticated',ids.leaver);const t=await val('select public.forum_create_thread($1,$2)',['Goodbye','Leaving soon']);
  await expect(db.query('select public.delete_my_account($1)',['wrong'])).rejects.toThrow(/exactly/);
  await db.query('select public.delete_my_account($1)',['leaver']);
  await db.exec('reset role');expect(await val('select count(*)::int from auth.users where id=$1',[ids.leaver])).toBe(0);expect(await val('select count(*)::int from private.hunter_accounts where user_id=$1',[ids.leaver])).toBe(0);
  expect((await raw('members','h-leaver')).archived).toBe(false);
  await as('authenticated',ids.hunter);expect((await val('select public.forum_thread($1)',[t])).messages[0]).toMatchObject({username:null,body:'Leaving soon'});
  await as('authenticated',ids.admin);await expect(db.query('select public.delete_my_account($1)',['Admin'])).rejects.toThrow(/Administrators cannot/);
 });
});

describe('recent changes',()=>{
 it('lists published records only, with no reasons or authors',async()=>{
  await as('authenticated',ids.admin);await save('glossary',{id:'g-draft',name:'Hidden draft',meaning:'x',status:'Provisional'});
  const g=await raw('glossary','GLS-x').catch(()=>null);expect(g).toBeUndefined();
  await save('library',{id:'doc',name:'Doc',category:'Shelf',order:1,url:'https://example.test/d'});
  const d=await raw('library','doc');await as('authenticated',ids.admin);await save('library',{...d,published:true},d.updated_at.toISOString());
  await as('anon');const changes=await val('select public.recent_changes(20)');
  expect(changes.some((c:any)=>c.id==='g-draft')).toBe(false);expect(changes.find((c:any)=>c.id==='doc')).toMatchObject({kind:'library',name:'Doc',change:'Published'});
  expect(Object.keys(changes[0]).sort()).toEqual(['change','changed_at','id','kind','name']);
 });
});
