import definition from './schema.json';
export type Kind = keyof typeof definition;
export type RecordData = { id: string; archived: boolean; published: boolean; updated_at?: string; [key: string]: string | boolean | undefined };
export type Dataset = Record<Kind, RecordData[]>;
export type Field = {key: string; label: string; type: string; required?: boolean; ref?: Kind; options?: string[]};
export const schemas = definition as Record<Kind, {title: string; sheet: string; prefix: string; fields: Field[]}>;
export const kinds = Object.keys(schemas) as Kind[];
export const emptyData = (): Dataset => Object.fromEntries(kinds.map(k=>[k,[]])) as unknown as Dataset;
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
 return errors;
}
export function parseWorkbook(raw: Record<string, unknown[][]>): {data: Dataset; issues: string[]} {
 const data=emptyData(),issues:string[]=[];
 for(const k of kinds){const grid=raw[k];if(!grid){issues.push(`Missing source table: ${k}`);continue;}const headers=grid[0].map(normalize);
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
