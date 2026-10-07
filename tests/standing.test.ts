import { beforeAll,afterAll,it,expect,describe } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { clanAuthority,emptyData,hunterStandings,isSeniorDuty,parseWorkbook,rankLabel,rankSteps,standingHistory,standingOf,validate,warriorRank,type RecordData } from '../src/model';

const row=(id:string,extra:Partial<RecordData>={}):RecordData=>({id,name:id,archived:false,published:true,...extra});

describe('warrior caste rank and senior standing',()=>{
 it('reads legacy seven-step ranks as standing without inventing a warrior rank',()=>{
  const leader=row('l',{rank:'Leader'});
  expect([warriorRank(leader),standingOf(leader),rankLabel(leader)]).toEqual(['','Clan Leader','Clan Leader']);
  const both=row('b',{rank:'Elite',standing:'Elder'});
  expect([warriorRank(both),standingOf(both),rankLabel(both)]).toEqual(['Elite','Elder','Elite · Elder']);
 });
 it('tracks four warrior steps and leaves the track empty for an Ancient with no recorded warrior rank',()=>{
  const d=emptyData();
  expect(rankSteps(row('e',{rank:'Elite'}),d).map(s=>s.rank)).toEqual(['Unblooded','Young Blood','Blooded','Elite']);
  expect(rankSteps(row('a',{standing:'Ancient'}),d).some(s=>s.reached||s.current)).toBe(false);
 });
 it('does not infer loss of office from an earlier advancement',()=>{
  const d=emptyData();const keth=row('k',{standing:'Ancient'});
  d.promotions=[row('p1',{member:'k',rank:'Leader',date:'2026-01-01'}),row('p2',{member:'k',rank:'Ancient',date:'2026-02-01'})];
  expect(standingHistory(keth,d).earlier).toEqual(['Clan Leader']);
  expect(standingHistory(row('x',{standing:'Ancient'}),d).earlier).toEqual([]);
 });
 it('shows Council standing and explicit current clan command together without duplicating hunters',()=>{
  const d=emptyData(),m=row('k',{rank:'Elite',standing:'Ancient',status:'Active'});d.members=[m];
  d.duties=[row('command',{name:'Clan Leader',member:'k',status:'Active'}),row('duplicate',{name:'Clan Leader',member:'k',status:'Acting'})];
  d.promotions=[row('p',{member:'k',rank:'Clan Leader'})];
  expect(hunterStandings(m,d)).toEqual(['Ancient','Clan Leader']);
  expect(rankLabel(m,d)).toBe('Elite · Ancient · Clan Leader');
  expect(clanAuthority(d).leaders).toEqual([m]);expect(clanAuthority(d).ancients).toEqual([m]);
  expect(standingHistory(m,d).earlier).toEqual([]);
 });
 it('does not derive current command from ended, archived, household-scoped or merely similar appointments',()=>{
  const d=emptyData(),m=row('k',{standing:'Ancient',status:'Active'});d.members=[m];
  for(const fields of [{end:'2026-01-01'},{archived:true},{status:'Ended'},{house:'h'},{name:'Assistant to the Clan Leader'}]){
   d.duties=[row('command',{name:'Clan Leader',member:'k',status:'Active',...fields})];
   expect(clanAuthority(d).leaders).toEqual([]);expect(hunterStandings(m,d)).toEqual(['Ancient']);
  }
  d.duties=[row('command',{name:'Clan Leader',member:'k',status:'Active'})];
  for(const fields of [{status:'Deceased'},{status:'Departed'},{archived:true}]){
   d.members=[{...m,...fields}];expect(clanAuthority(d).leaders).toEqual([]);
  }
 });
 it('lists a current Clan Leader appointment even without stored senior standing',()=>{
  const d=emptyData(),m=row('l',{rank:'Elite',status:'Active'});d.members=[m];
  d.duties=[row('command',{name:' clan leader ',member:'l',status:'Active'})];
  expect(hunterStandings(m,d)).toEqual(['Clan Leader']);expect(rankLabel(m,d)).toBe('Elite · Clan Leader');
  expect(rankLabel(m)).toBe('Elite');expect(clanAuthority(d).leaders).toEqual([m]);
 });
 it('requires a warrior rank or a standing',()=>{
  const d=emptyData();
  expect(validate('members',row('m',{status:'Active'}),d)).toContain('Record a warrior caste rank or a senior standing.');
  expect(validate('members',row('m',{status:'Active',standing:'Ancient'}),d)).not.toContain('Record a warrior caste rank or a senior standing.');
  expect(validate('members',row('m',{status:'Active',rank:'Elder'}),d)).toContain('Warrior caste rank has an unsupported value.');
 });
 it('lists serving authority only and separates household-senior duties',()=>{
  const d=emptyData();d.members=[row('a',{standing:'Ancient',status:'Active'}),row('dead',{standing:'Ancient',status:'Deceased'}),row('e',{rank:'Elite',standing:'Elder',status:'Active'})];
  const {leaders,ancients,elders}=clanAuthority(d);
  expect([leaders.length,ancients.map(m=>m.id),elders.map(m=>m.id)]).toEqual([0,['a'],['e']]);
  expect([isSeniorDuty(row('d',{name:'Household Senior For Vek’ta'})),isSeniorDuty(row('d',{name:'First Hunt Master'}))]).toEqual([true,false]);
 });
 it('imports the workbook\'s old headings and moves senior ranks into standing',()=>{
  const raw:any={members:[['ID','Yautja name','Rank','Agaj’ya / household','Standing'],['m','Keth’tar','Ancient','h','Active'],['y','Young','Blooded','h','Active']],houses:[['ID','Agaj’ya name'],['h','Vek’ta']]};
  const {data}=parseWorkbook(raw);
  expect(data.members.map(m=>[m.rank,m.standing,m.house,m.status])).toEqual([['','Ancient','h','Active'],['Blooded','','h','Active']]);
  expect(data.houses[0].name).toBe('Vek’ta');
 });
});

const db=new PGlite();
const ids={admin:'11111111-1111-4111-8111-111111111111',elder:'22222222-2222-4222-8222-222222222222',elite:'33333333-3333-4333-8333-333333333333',young:'44444444-4444-4444-8444-444444444444'};
async function as(role:string,id:string=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const val=async(sql:string,params:unknown[]=[])=>Object.values((await db.query<any>(sql,params)).rows[0])[0] as any;
const save=(kind:string,payload:any,stamp:string|null=null)=>db.query('select public.save_record($1,$2::jsonb,$3::timestamptz,$4)',[kind,JSON.stringify(payload),stamp,'Setup']);
const hunterSave=(kind:string,payload:any,stamp:string|null=null)=>db.query('select public.hunter_save($1,$2::jsonb,$3::timestamptz,$4)',[kind,JSON.stringify(payload),stamp,'Hunter edit']);
const raw=async(kind:string,id:string)=>{await db.exec('reset role');return (await db.query<any>(`select * from public.${kind} where id=$1`,[id])).rows[0];};
const hunt=(id:string,hunter:string,extra:object={})=>({id,name:id,hunter,quarry:'Q',weapon:'W',state:'Completed',outside:'No',review:'Accepted',published:true,...extra});

beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 for(const id of Object.values(ids))await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@private.test`]);
 for(const f of ['202610020001_archive.sql','202610030001_hunters.sql','202610030002_accounts_forum.sql','202610030003_community.sql'])await db.exec(fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
 await db.exec(`insert into private.administrators values('${ids.admin}')`);
 await as('authenticated',ids.admin);
 await save('houses',{id:'house',name:'House',status:'Active',published:true});
 for(const [id,rank] of [['ancient','Ancient'],['leader','Leader'],['elder','Elder'],['elite','Elite'],['young','Young Blood']])await save('members',{id,name:id,rank,status:'Active',house:'house',published:true});
 await save('promotions',{id:'p-leader',name:'Became Clan Leader',member:'ancient',rank:'Leader',published:true});
 for(const [account,member] of [[ids.elder,'elder'],[ids.elite,'elite'],[ids.young,'young']])await db.query('select public.review_account($1,$2,$3)',[account,'approved',member]);
 await db.exec('reset role');
 await db.exec(fs.readFileSync('supabase/migrations/202610040001_standing.sql','utf8'));
});
afterAll(async()=>await db.close());

describe('standing migration',()=>{
 it('moves senior ranks to standing and leaves the warrior rank unrecorded',async()=>{
  const rows=(await db.query<any>("select id,rank,standing from public.members order by id")).rows;
  expect(rows).toEqual([{id:'ancient',rank:null,standing:'Ancient'},{id:'elder',rank:null,standing:'Elder'},{id:'elite',rank:'Elite',standing:null},{id:'leader',rank:null,standing:'Clan Leader'},{id:'young',rank:'Young Blood',standing:null}]);
  expect((await raw('promotions','p-leader')).rank).toBe('Clan Leader');
  expect(await val("select reason from public.audit_log where record_id='leader' order by id desc limit 1")).toBe('Split senior standing from warrior caste rank');
 });
 it('refuses senior steps as warrior rank and a hunter with neither',async()=>{
  await as('authenticated',ids.admin);
  await expect(save('members',{id:'bad',name:'Bad',rank:'Elder',status:'Active'})).rejects.toThrow(/members_rank_check/);
  await expect(save('members',{id:'bad',name:'Bad',status:'Active'})).rejects.toThrow(/members_rank_or_standing/);
  await save('members',{id:'senior-elite',name:'Senior elite',rank:'Elite',standing:'Elder',status:'Active'});
 });
 it('grants Elder permissions from standing, not from warrior rank',async()=>{
  await as('authenticated',ids.elder);expect(await val('select public.my_access()')).toMatchObject({elder:true,standing:'Elder',rank:null});
  await hunterSave('chronicle',{id:'HIS-1',name:'Entry',order:1,category:'Other',certainty:'Recorded',body:'Account'});
  await as('authenticated',ids.elite);expect(await val('select public.my_access()')).toMatchObject({elder:false,rank:'Elite'});
  await expect(hunterSave('chronicle',{id:'HIS-2',name:'Entry',order:2,category:'Other',certainty:'Recorded',body:'Account'})).rejects.toThrow(/Elder, Clan Leader or Ancient standing/);
 });
 it('lets a hunter declare the context of their own undertaking',async()=>{
  await as('authenticated',ids.young);
  await hunterSave('hunts',{id:'HNT-rite',name:'Rite',hunter:'young',context:'Blooding rite',quarry:'Q',weapon:'W',state:'Declared',outside:'No'});
  expect((await raw('hunts','HNT-rite')).context).toBe('Blooding rite');
  await as('authenticated',ids.young);
  await expect(hunterSave('hunts',{id:'HNT-x',name:'X',hunter:'young',context:'Ritual',quarry:'Q',weapon:'W',state:'Declared',outside:'No'})).rejects.toThrow(/hunts_context_check/);
 });
 it('suggests an advancement only for an accepted blooding rite by a hunter not yet Blooded',async()=>{
  await as('authenticated',ids.admin);
  await save('hunts',hunt('h-rite','young',{context:'Blooding rite'}));
  await save('hunts',hunt('h-training','young',{context:'Training hunt'}));
  await save('hunts',hunt('h-personal','elite',{context:'Personal hunt'}));
  await save('hunts',hunt('h-unrecorded','young'));
  await save('hunts',hunt('h-senior','elder',{context:'Blooding rite'}));
  expect((await val('select public.promotion_suggestions()')).map((s:any)=>s.hunt)).toEqual(['h-rite']);
 });
});
