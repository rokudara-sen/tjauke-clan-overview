import definition from './schema.json';
export type Kind = keyof typeof definition;
export type RecordData = { id: string; archived: boolean; published: boolean; updated_at?: string; [key: string]: string | boolean | undefined };
export type Dataset = Record<Kind, RecordData[]>;
export type Field = {key: string; label: string; type: string; required?: boolean; ref?: Kind; options?: string[]};
export const schemas = definition as Record<Kind, {title: string; sheet: string; prefix: string; added?: string; fields: Field[]}>;
export const kinds = Object.keys(schemas) as Kind[];
export const emptyData = (): Dataset => Object.fromEntries(kinds.map(k=>[k,[]])) as unknown as Dataset;
/** Fills kinds the database does not return yet (for example before a later migration is applied). */
export const withAllKinds = (partial: Partial<Dataset>): Dataset => ({...emptyData(), ...Object.fromEntries(Object.entries(partial).filter(([,v])=>Array.isArray(v)))});
export const active = (rows: RecordData[]) => rows.filter(r=>!r.archived);
export const ordered = (rows: RecordData[]) => [...rows].sort((a,b)=> order(a.order)-order(b.order)||String(a.name).localeCompare(String(b.name)));
const order = (v: unknown) => v === '' || v == null || !Number.isFinite(Number(v)) ? Infinity : Number(v);
export const openHunts = (rows: RecordData[]) => active(rows).filter(r=>['Planned','Declared','Underway'].includes(String(r.state)));
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
 if(kind==='members'){let id=String(row.sponsor||'');const seen=new Set([row.id]);while(id){if(seen.has(id)){errors.push('Sponsor cycle detected.');break;}seen.add(id);id=String(data.members.find(r=>r.id===id)?.sponsor||'');}}
 if(kind==='hunts'&&row.hunter&&row.hunter===row.witness)errors.push('Hunter and witness must differ.');
 if(kind==='duties'&&row.start&&row.end&&row.end<row.start)errors.push('End date precedes start date.');
 if(kind==='promotions'&&row.hunt){const hunt=data.hunts.find(h=>h.id===row.hunt);if(hunt&&hunt.hunter!==row.member)errors.push('The undertaking belongs to a different hunter.');}
 return errors;
}
export function parseWorkbook(raw: Record<string, unknown[][]>): {data: Dataset; issues: string[]} {
 const data=emptyData(),issues:string[]=[];
 for(const k of kinds){const grid=raw[k];if(!grid){if(!schemas[k].added)issues.push(`Missing source table: ${k}`);continue;}const headers=grid[0].map(normalize);
  for(const cells of grid.slice(1).filter(r=>r.some(v=>v!=null&&v!==''))){const get=(h:string)=>cells[headers.indexOf(normalize(h))];const id=String(get('ID')||'');if(!id){issues.push(`${k}: missing legacy ID`);continue;}
   const row:RecordData={id,archived:normalize(get('Archived'))==='true',published:false};
   for(const f of schemas[k].fields)row[f.key]=String(get(f.label)??'');
   row.created_at=String(get('Created at')||'');row.updated_at=String(get('Updated at')||'');
   data[k].push(row);
  }
 }
 for(const k of kinds)for(const row of data[k])for(const f of schemas[k].fields.filter(f=>f.ref)){const value=String(row[f.key]||'');if(!value||data[f.ref!].some(r=>r.id===value))continue;const matches=data[f.ref!].filter(r=>normalize(r.name)===normalize(value));if(matches.length===1)row[f.key]=matches[0].id;else issues.push(`${k}/${row.id}: unresolved ${f.label}: ${value}`);}
 for(const k of kinds){const ids=new Set();for(const r of data[k]){if(ids.has(r.id))issues.push(`${k}: duplicate ID ${r.id}`);ids.add(r.id);}}
 return {data,issues};
}

export const elderRanks=['Elder','Leader','Ancient'];

export type ServiceEntry={kind:Kind;id:string;title:string;role:string;date:string;era:string;state:string};
/** A hunter's undertakings, witnessed hunts, duties, history and promotions, ordered by real-world date. Undated entries follow in their own group. */
export function serviceRecord(memberId:string,data:Dataset):ServiceEntry[]{
 const s=(v:unknown)=>v==null?'':String(v);
 const entries:ServiceEntry[]=[
  ...active(data.hunts).filter(h=>h.hunter===memberId).map(h=>({kind:'hunts' as Kind,id:h.id,title:s(h.name),role:'Undertaking',date:s(h.date),era:s(h.era),state:[h.state,h.state==='Completed'&&h.review?`claim ${String(h.review).toLowerCase()}`:''].filter(Boolean).join(', ')})),
  ...active(data.hunts).filter(h=>h.witness===memberId).map(h=>({kind:'hunts' as Kind,id:h.id,title:s(h.name),role:'Witness',date:s(h.date),era:s(h.era),state:s(h.state)})),
  ...active(data.duties).filter(d=>d.member===memberId).map(d=>({kind:'duties' as Kind,id:d.id,title:s(d.name),role:'Duty',date:s(d.start),era:'',state:d.end?`${s(d.status)}, until ${s(d.end)}`:s(d.status)})),
  ...active(data.chronicle).filter(c=>c.member===memberId).map(c=>({kind:'chronicle' as Kind,id:c.id,title:s(c.name),role:'History',date:s(c.date),era:s(c.era),state:s(c.certainty)})),
  ...active(data.promotions).filter(p=>p.member===memberId).map(p=>({kind:'promotions' as Kind,id:p.id,title:s(p.name),role:`Rank: ${s(p.rank)}`,date:s(p.date),era:s(p.era),state:''})),
 ];
 return entries.sort((a,b)=>(a.date?0:1)-(b.date?0:1)||a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}

/** Rank steps for a profile. Only promotions that were recorded carry a date or source. */
export function rankSteps(member:RecordData,data:Dataset){
 const ranks=schemas.members.fields.find(f=>f.key==='rank')!.options!;
 const promotions=active(data.promotions).filter(p=>p.member===member.id);
 const current=ranks.indexOf(String(member.rank));
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

const searchFields=['epithet','meaning','quarry','summary','category','era','usage','trophy','mandate','kind','rank'];
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
