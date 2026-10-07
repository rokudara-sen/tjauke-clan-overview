import definition from './schema.json';
export type Kind = keyof typeof definition;
export type RecordData = { id: string; archived: boolean; published: boolean; updated_at?: string; [key: string]: string | boolean | undefined };
export type Dataset = Record<Kind, RecordData[]>;
/** `term` is the clan's provisional Yautja word for a field; `legacy` is the workbook column heading when it differs from the label; `derived` explains where the database takes a read-only value from. */
export type Field = {key: string; label: string; type: string; required?: boolean; ref?: Kind; options?: string[]; term?: string; legacy?: string; derived?: string};
export const schemas = definition as Record<Kind, {title: string; sheet: string; prefix: string; added?: string; fields: Field[]}>;
export const kinds = Object.keys(schemas) as Kind[];
export const emptyData = (): Dataset => Object.fromEntries(kinds.map(k=>[k,[]])) as unknown as Dataset;
/** Fills kinds the database does not return yet (for example before a later migration is applied). */
export const withAllKinds = (partial: Partial<Dataset>): Dataset => ({...emptyData(), ...Object.fromEntries(Object.entries(partial).filter(([,v])=>Array.isArray(v)))});
export const active = (rows: RecordData[]) => rows.filter(r=>!r.archived);
export const ordered = (rows: RecordData[]) => [...rows].sort((a,b)=> order(a.order)-order(b.order)||String(a.name).localeCompare(String(b.name)));
const order = (v: unknown) => v === '' || v == null || !Number.isFinite(Number(v)) ? Infinity : Number(v);
export const openHunts = (rows: RecordData[]) => active(rows).filter(r=>['Planned','Declared','Underway'].includes(String(r.state)));
export const readyForJudgment = (hunt: RecordData) => hunt.review==='Pending' && ['Completed','Withdrawn'].includes(String(hunt.state)) && String(hunt.account||'').trim().length>0;
export const undertakingStatus = (hunt: RecordData) => hunt.review && hunt.review!=='Pending' ? `Claim ${String(hunt.review).toLowerCase()}` : readyForJudgment(hunt) ? 'Awaiting judgment' : String(hunt.state||'Planned');
export const safeUrl = (value: unknown) => {try {const u=new URL(String(value));return ['http:','https:'].includes(u.protocol)?String(value):null;}catch{return null;}};
export const normalize = (v: unknown) => String(v??'').replace(/[’‘]/g,"'").trim().toLowerCase();
export function validate(kind: Kind, row: RecordData, data: Dataset): string[] {
 const errors: string[]=[];
 for(const f of schemas[kind].fields){const v=String(row[f.key]??'');
  if(f.required&&!v.trim()) errors.push(`${f.label} is required.`);
  if(v&&f.type==='url'&&!safeUrl(v))errors.push(`${f.label} must be an HTTP or HTTPS URL.`);
  if(v&&f.type==='number'&&!Number.isFinite(Number(v)))errors.push(`${f.label} must be numeric.`);
  if(v&&f.type==='select'&&!f.options?.includes(v))errors.push(`${f.label} has an unsupported value.`);
  if(v&&f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))errors.push(`${f.label} must be a valid date.`);
  if(v&&f.ref&&!data[f.ref].some(r=>r.id===v))errors.push(`${f.label} refers to a missing record.`);
 }
 if(kind==='relations') {if(row.from===row.to)errors.push('Choose two different affiliations.');if(!row.archived&&data.relations.some(r=>r.id!==row.id&&!r.archived&&r.from===row.from&&r.to===row.to))errors.push('This directional assessment already exists.');}
 if(kind==='members'&&!String(row.rank??'').trim()&&!String(row.standing??'').trim())errors.push('Record a warrior caste rank or a senior standing.');
 if(kind==='members'){let id=String(row.sponsor||'');const seen=new Set([row.id]);while(id){if(seen.has(id)){errors.push('Sponsor cycle detected.');break;}seen.add(id);id=String(data.members.find(r=>r.id===id)?.sponsor||'');}}
 if(kind==='hunts'&&row.hunter&&row.hunter===row.witness)errors.push('Hunter and witness must differ.');
 if(kind==='duties'&&row.start&&row.end&&row.end<row.start)errors.push('End date precedes start date.');
 if(kind==='duties'&&isSeniorDuty(row)){
  if(!row.house)errors.push('A household senior appointment needs a household.');
  else if(!row.archived&&currentDuty(row)&&data.duties.some(d=>d.id!==row.id&&!d.archived&&d.house===row.house&&isSeniorDuty(d)&&currentDuty(d)))errors.push('This household already has a current household senior. End that appointment first.');
 }
 // Elder, Clan Leader and Ancient are conferred by the clan and the Council, not earned through a single undertaking.
 if(kind==='promotions'&&row.hunt&&standingConferred(row))errors.push('Senior standing is conferred, not earned through an undertaking. Clear “Earned through undertaking”.');
 if(kind==='promotions'&&row.hunt){const hunt=data.hunts.find(h=>h.id===row.hunt);if(hunt&&hunt.hunter!==row.member)errors.push('The undertaking belongs to a different hunter.');}
 if(kind==='trophies'&&row.hunt&&!row.archived){const hunt=data.hunts.find(h=>h.id===row.hunt);if(hunt&&hunt.hunter!==row.hunter)errors.push('The undertaking belongs to a different hunter.');if(hunt&&hunt.review!=='Accepted')errors.push('Only an undertaking whose claim was judged Accepted can supply a trophy.');}
 if(kind==='library'&&!String(row.body??'').trim()&&!String(row.url??'').trim())errors.push('Add the document text or an external copy.');
 return errors;
}
export type DocumentBlock={kind:'heading'|'quote'|'paragraph';text:string};
/** Document text as written in administration: each line is a paragraph, `## ` starts a section, `> ` sets a line apart as a quotation. */
export const documentBlocks=(text:unknown):DocumentBlock[]=>String(text??'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>/^#{1,3}\s/.test(l)?{kind:'heading',text:l.replace(/^#+\s+/,'')}:l.startsWith('>')?{kind:'quote',text:l.replace(/^>\s*/,'')}:{kind:'paragraph',text:l});
export function parseWorkbook(raw: Record<string, unknown[][]>): {data: Dataset; issues: string[]} {
 const data=emptyData(),issues:string[]=[];
 for(const k of kinds){const grid=raw[k];if(!grid){if(!schemas[k].added)issues.push(`Missing source table: ${k}`);continue;}const headers=grid[0].map(normalize);
  for(const cells of grid.slice(1).filter(r=>r.some(v=>v!=null&&v!==''))){const get=(h:string)=>cells[headers.indexOf(normalize(h))];const id=String(get('ID')||'');if(!id){issues.push(`${k}: missing legacy ID`);continue;}
   const row:RecordData={id,archived:normalize(get('Archived'))==='true',published:false};
   for(const f of schemas[k].fields)row[f.key]=String(get(f.label)??get(f.legacy??f.label)??'');
   // The workbook keeps one seven-step rank; senior steps become standing.
   if(k==='members'&&legacyStanding[String(row.rank)]){row.standing=legacyStanding[String(row.rank)];row.rank='';}
   if(k==='promotions'&&row.rank==='Leader')row.rank='Clan Leader';
   row.created_at=String(get('Created at')||'');row.updated_at=String(get('Updated at')||'');
   data[k].push(row);
  }
 }
 for(const k of kinds)for(const row of data[k])for(const f of schemas[k].fields.filter(f=>f.ref)){const value=String(row[f.key]||'');if(!value||data[f.ref!].some(r=>r.id===value))continue;const matches=data[f.ref!].filter(r=>normalize(r.name)===normalize(value));if(matches.length===1)row[f.key]=matches[0].id;else issues.push(`${k}/${row.id}: unresolved ${f.label}: ${value}`);}
 for(const k of kinds){const ids=new Set();for(const r of data[k]){if(ids.has(r.id))issues.push(`${k}: duplicate ID ${r.id}`);ids.add(r.id);}}
 return {data,issues};
}

export const warriorRanks=['Unblooded','Young Blood','Blooded','Elite'];
export const seniorStandings=['Elder','Clan Leader','Ancient'];
const legacyStanding:Record<string,string>={Elder:'Elder',Leader:'Clan Leader',Ancient:'Ancient'};
// Until the standing migration runs, the database still holds Elder, Leader and Ancient in the rank column.
/** Warrior caste rank, or '' when none is recorded. */
export const warriorRank=(m:RecordData|undefined)=>warriorRanks.includes(String(m?.rank))?String(m!.rank):'';
/** Senior standing (Elder, Clan Leader, Ancient), or '' when the hunter holds none. */
export const standingOf=(m:RecordData|undefined)=>seniorStandings.includes(String(m?.standing))?String(m!.standing):legacyStanding[String(m?.rank)]||'';
/** Current standing can coexist with an explicitly recorded clan-leadership appointment. */
export const isClanLeaderDuty=(d:RecordData)=>normalize(d.name)==='clan leader'&&!d.house;
export function hunterStandings(m:RecordData|undefined,data?:Dataset){
 const values=[standingOf(m)].filter(Boolean);
 if(m&&!m.archived&&serving(m)&&data&&active(data.duties).some(d=>d.member===m.id&&isClanLeaderDuty(d)&&currentDuty(d))&&!values.includes('Clan Leader'))values.push('Clan Leader');
 return values;
}
/** Stored rank and current standing; separate fields do not imply separate authority hierarchies. */
export const rankLabel=(m:RecordData|undefined,data?:Dataset)=>[warriorRank(m),...hunterStandings(m,data)].filter(Boolean).join(' · ');
const promotedTo=(p:RecordData)=>p.rank==='Leader'?'Clan Leader':String(p.rank||'');
/** Whether an advancement record confers senior standing rather than a warrior caste rank. */
export const standingConferred=(p:RecordData)=>seniorStandings.includes(promotedTo(p));
/** Hunters who are not dead or departed, so still hold their standing. */
const serving=(m:RecordData)=>!['Deceased','Departed'].includes(String(m.status));
/** Clan Leader, Council of Ancients and Elders among serving hunters. Only the first two govern; Elders are listed with senior standing. */
export function clanAuthority(data:Dataset){
 const members=active(data.members).filter(serving).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 const holding=(s:string)=>members.filter(m=>hunterStandings(m,data).includes(s));
 return {leaders:holding('Clan Leader'),ancients:holding('Ancient'),elders:holding('Elder')};
}
/** Household-senior appointments are shown as household leadership, not alongside other duties.
 * The current one decides the household's senior (the database keeps houses.senior in step); keep this pattern in line with private.is_senior_duty. */
export const isSeniorDuty=(d:RecordData)=>/^household senior\b/i.test(String(d.name||'').trim());
export const currentDuty=(d:RecordData)=>['Active','Acting'].includes(String(d.status))&&!d.end;
/** An advancement records acquisition, not an end date. Do not infer a former office from it. */
export function standingHistory(member:RecordData,data:Dataset){
 const entries=active(data.promotions).filter(p=>p.member===member.id&&seniorStandings.includes(promotedTo(p))).sort((a,b)=>String(a.date||'~').localeCompare(String(b.date||'~')));
 const now=hunterStandings(member,data);
 return {entries,earlier:[...new Set(entries.map(promotedTo))].filter(s=>!now.includes(s))};
}

export type ServiceEntry={kind:Kind;id:string;title:string;role:string;date:string;era:string;state:string};
/** A hunter's undertakings, witnessed hunts, duties, history and promotions, ordered by real-world date. Undated entries follow in their own group. */
export function serviceRecord(memberId:string,data:Dataset):ServiceEntry[]{
 const s=(v:unknown)=>v==null?'':String(v);
 const entries:ServiceEntry[]=[
  ...active(data.hunts).filter(h=>h.hunter===memberId).map(h=>({kind:'hunts' as Kind,id:h.id,title:s(h.name),role:'Undertaking',date:s(h.date),era:s(h.era),state:[h.state,h.state==='Completed'&&h.review?`claim ${String(h.review).toLowerCase()}`:''].filter(Boolean).join(', ')})),
  ...active(data.hunts).filter(h=>h.witness===memberId).map(h=>({kind:'hunts' as Kind,id:h.id,title:s(h.name),role:'Witness',date:s(h.date),era:s(h.era),state:[h.state,h.witness_status?`witness ${String(h.witness_status).toLowerCase()}`:''].filter(Boolean).join(', ')})),
  ...active(data.duties).filter(d=>d.member===memberId).map(d=>({kind:'duties' as Kind,id:d.id,title:s(d.name),role:'Duty',date:s(d.start),era:'',state:d.end?`${s(d.status)}, until ${s(d.end)}`:s(d.status)})),
  ...active(data.chronicle).filter(c=>c.member===memberId).map(c=>({kind:'chronicle' as Kind,id:c.id,title:s(c.name),role:'History',date:s(c.date),era:s(c.era),state:s(c.certainty)})),
  ...active(data.promotions).filter(p=>p.member===memberId).map(p=>({kind:'promotions' as Kind,id:p.id,title:s(p.name),role:seniorStandings.includes(promotedTo(p))?`Standing: ${promotedTo(p)}`:`Advancement: ${s(p.rank)}`,date:s(p.date),era:s(p.era),state:''})),
 ];
 return entries.sort((a,b)=>(a.date?0:1)-(b.date?0:1)||a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}

/** Warrior caste steps for a profile. Only advancements that were recorded carry a date or source. Senior standing is not a step. */
export function rankSteps(member:RecordData,data:Dataset){
 const ranks=warriorRanks;
 const promotions=active(data.promotions).filter(p=>p.member===member.id);
 const current=ranks.indexOf(warriorRank(member));
 return ranks.map((rank,i)=>({rank,current:i===current,reached:current>=0&&i<=current,promotion:promotions.filter(p=>p.rank===rank).sort((a,b)=>String(a.date||'~').localeCompare(String(b.date||'~')))[0]}));
}

export const currentRelation=(data:Dataset,from:string,to:string)=>active(data.relations).find(r=>r.from===from&&r.to===to);
/** Directions whose current stance differs from the current stance in the reverse direction. Missing assessments are not counted. */
export function asymmetries(data:Dataset){
 const clans=new Set(active(data.clans).map(c=>c.id));
 return active(data.relations).filter(r=>clans.has(String(r.from))&&clans.has(String(r.to))&&String(r.from)<String(r.to)).flatMap(r=>{const back=currentRelation(data,String(r.to),String(r.from));return back&&back.stance!==r.stance?[{forward:r,back}]:[];});
}
/** Every assessment for one direction, current first, then superseded ones newest first. */
export const assessmentHistory=(data:Dataset,from:string,to:string)=>data.relations.filter(r=>r.from===from&&r.to===to).sort((a,b)=>Number(a.archived)-Number(b.archived)||String(b.assessed||'').localeCompare(String(a.assessed||'')));

const searchFields=['epithet','meaning','quarry','summary','category','era','usage','trophy','mandate','kind','rank','standing','context'];
export type SearchHit={kind:Kind;row:RecordData;match:string};
/** Name matches rank first, then matches in short descriptive fields. Settings and relations are not searchable records. */
export function searchArchive(query:string,data:Dataset,limit=30):SearchHit[]{
 const q=normalize(query);if(!q)return [];
 const hits:{hit:SearchHit;score:number}[]=[];
 for(const kind of kinds.filter(k=>!['settings','relations'].includes(k)))for(const row of data[kind]){
  const name=normalize(row.name);let score=name.startsWith(q)?0:name.split(/[\s-]+/).some(w=>w.startsWith(q))?1:name.includes(q)?2:-1,match='';
  // Outside the name, single words must match from the start of a word, so short queries do not hit the middle of words.
  if(score<0){const key=searchFields.find(k=>{const t=normalize(row[k]);return q.includes(' ')?t.includes(q):t.split(/[^\p{L}\p{N}']+/u).some(w=>w.startsWith(q));});if(!key)continue;score=3;match=`${schemas[kind].fields.find(f=>f.key===key)?.label||key}: ${String(row[key])}`;}
  hits.push({hit:{kind,row,match},score:score+(row.archived?4:0)});
 }
 return hits.sort((a,b)=>a.score-b.score||String(a.hit.row.name).localeCompare(String(b.hit.row.name))).slice(0,limit).map(h=>h.hit);
}

/** Trophies whose claim was judged Accepted. Completed hunts with a pending or rejected claim are not trophies. */
export const acceptedTrophies=(data:Dataset,filter:(hunt:RecordData)=>boolean=()=>true)=>active(data.hunts).filter(h=>h.review==='Accepted'&&String(h.trophy||'').trim()&&filter(h)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.name).localeCompare(String(b.name)));

/** Trophy hall entries in display order, then newest first. An entry citing an undertaking is shown only while that claim stays Accepted for the same hunter. */
export const hallTrophies=(data:Dataset,filter:(trophy:RecordData)=>boolean=()=>true)=>active(data.trophies).filter(t=>{const hunt=t.hunt&&data.hunts.find(h=>h.id===t.hunt);return (!hunt||(hunt.review==='Accepted'&&hunt.hunter===t.hunter))&&filter(t);}).sort((a,b)=>order(a.order)-order(b.order)||String(b.date||'').localeCompare(String(a.date||''))||String(a.name).localeCompare(String(b.name)));
