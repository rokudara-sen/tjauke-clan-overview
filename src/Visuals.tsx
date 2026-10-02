import type { ReactNode } from 'react';
import { active, rankSteps, schemas, serviceRecord, type Dataset, type Kind, type RecordData } from './model';
export const href=(kind:string,id?:string)=>`#/${kind}${id?'/'+encodeURIComponent(id):''}`;
const options=(kind:Kind,key:string)=>schemas[kind].fields.find(f=>f.key===key)?.options||[];
const slug=(v:unknown)=>String(v||'unclassified').toLowerCase().replace(/[^a-z]+/g,'-');
const byName=(a:RecordData,b:RecordData)=>String(a.name).localeCompare(String(b.name));
const NONE='—none';

type Row={key:string;label:ReactNode;note?:string};type Item={row:string;col:string;label:string;to:string};
function DotMatrix({caption,corner,rows,cols,items}:{caption:string;corner:string;rows:Row[];cols:string[];items:Item[]}){
 return <div className="table-scroll"><table className="dot-matrix"><caption className="sr-only">{caption}</caption><thead><tr><th scope="col">{corner}</th>{cols.map(c=><th scope="col" key={c}>{c}</th>)}<th scope="col" className="total">Total</th></tr></thead><tbody>{rows.map(r=>{const mine=items.filter(i=>i.row===r.key);return <tr key={r.key}><th scope="row">{r.label}{r.note&&<small>{r.note}</small>}</th>{cols.map(c=><td key={c}>{mine.filter(i=>i.col===c).map(i=><a key={i.to} className="dot" href={i.to} aria-label={i.label} data-tip={i.label}/>)}</td>)}<td className="total">{mine.length}</td></tr>;})}</tbody></table></div>;
}
function householdRows(data:Dataset,used:Set<string>):Row[]{
 const rows:Row[]=active(data.houses).sort(byName).map(h=>({key:h.id,label:<a href={href('houses',h.id)}>{h.name}</a>,note:h.status&&h.status!=='Active'?String(h.status):undefined}));
 return used.has(NONE)?[...rows,{key:NONE,label:<span className="muted">No household</span>}]:rows;
}
const houseKey=(data:Dataset,house:unknown)=>house&&active(data.houses).some(h=>h.id===house)?String(house):NONE;
const withUnlisted=(cols:string[],values:string[],fallback:string)=>values.some(v=>!cols.includes(v))?[...cols,fallback]:cols;

export function HouseRanks({data}:{data:Dataset}){
 const members=active(data.members);if(!members.length)return <p className="empty">No hunters recorded.</p>;
 const ranks=options('members','rank'),cols=withUnlisted(ranks,members.map(m=>String(m.rank||'')),'Not recorded');
 const items=members.sort(byName).map(m=>({row:houseKey(data,m.house),col:ranks.includes(String(m.rank))?String(m.rank):'Not recorded',label:`${m.name}, ${m.rank||'rank not recorded'}`,to:href('members',m.id)}));
 return <DotMatrix caption="Hunters in each household by rank, lowest rank first" corner="Household" rows={householdRows(data,new Set(items.map(i=>i.row)))} cols={cols} items={items}/>;
}

export function HuntOutcomes({data}:{data:Dataset}){
 const hunts=active(data.hunts);if(!hunts.length)return <p className="empty">No undertakings recorded.</p>;
 const states=options('hunts','state'),cols=withUnlisted(states,hunts.map(h=>String(h.state||'')),'Not recorded');
 const items=hunts.sort(byName).map(h=>{const hunter=data.members.find(m=>m.id===h.hunter);return {row:houseKey(data,hunter?.house),col:states.includes(String(h.state))?String(h.state):'Not recorded',label:`${h.name}${hunter?`, ${hunter.name}`:''}`,to:href('hunts',h.id)};});
 return <DotMatrix caption="Undertakings by the hunter's household and their state" corner="Household" rows={householdRows(data,new Set(items.map(i=>i.row)))} cols={cols} items={items}/>;
}

export function Lineage({data}:{data:Dataset}){
 const members=active(data.members);if(!members.length)return <p className="empty">No hunters recorded.</p>;
 const ids=new Set(members.map(m=>m.id)),seniors=new Set(active(data.houses).map(h=>String(h.senior||'')));
 const house=(m:RecordData)=>data.houses.find(h=>h.id===m.house)?.name;
 const roots=members.filter(m=>!m.sponsor||m.sponsor===m.id||!ids.has(String(m.sponsor))).sort((a,b)=>String(house(a)||'~').localeCompare(String(house(b)||'~'))||byName(a,b));
 const node=(m:RecordData,seen:Set<string>,parent?:RecordData):ReactNode=>{const kids=seen.has(m.id)?[]:members.filter(k=>k.sponsor===m.id&&k.id!==m.id).sort(byName);const next=new Set(seen).add(m.id);
  return <li key={m.id}><div className="node"><a href={href('members',m.id)}>{m.name}</a><small>{[m.rank||'Rank not recorded',house(m),seniors.has(m.id)&&'household senior',parent&&parent.house!==m.house&&`sponsored from ${house(parent)||'outside a household'}`,m.sponsor&&!ids.has(String(m.sponsor))&&'sponsor not listed'].filter(Boolean).join(' · ')}</small></div>{kids.length>0&&<ul>{kids.map(k=>node(k,next,m))}</ul>}</li>;};
 return <ul className="lineage">{roots.map(r=>node(r,new Set()))}</ul>;
}

const evidence=['Recorded','Corroborated','Reconstructed','Oral tradition','Disputed'];
export function EvidenceKey(){return <ul className="evidence-key" aria-label="Evidence key">{evidence.map(e=><li key={e}><span className={`tl-mark ${slug(e)}`} aria-hidden="true"/>{e}</li>)}</ul>;}
export function Timeline({rows}:{rows:RecordData[]}){
 const era=(r?:RecordData)=>String(r?.era||'Era not recorded');
 return <ol className="timeline">{rows.flatMap((r,i)=>[...(i===0||era(r)!==era(rows[i-1])?[<li key={`era-${r.id}`} className={`tl-era ${slug(r.certainty)}`}>{era(r)}</li>]:[]),<li key={r.id} className={`tl-entry ${slug(r.certainty)}`}><details><summary><span className={`tl-mark ${slug(r.certainty)}`} aria-hidden="true"/><strong>{r.name}</strong><span className="tag">{r.certainty||'Not classified'}</span></summary>{r.summary&&<p>{r.summary}</p>}<p className="prose">{r.body}</p><a href={href('chronicle',r.id)}>Sources and references</a></details></li>])}</ol>;
}

export function RankTrack({member,data}:{member:RecordData;data:Dataset}){
 if(!member.rank)return <p className="empty">Rank not recorded.</p>;
 const steps=rankSteps(member,data),recorded=steps.some(s=>s.promotion);
 return <><ol className="rank-track" aria-label={`Rank: ${member.rank}`}>{steps.map(s=><li key={s.rank} className={s.current?'current':s.reached?'reached':undefined} aria-current={s.current?'step':undefined}>
  <span className="rank-name">{s.rank}</span>
  {s.promotion&&<a href={href('promotions',s.promotion.id)}>{s.promotion.date||s.promotion.era||'Recorded'}</a>}
 </li>)}</ol>{!recorded&&<p className="section-note">No promotions recorded yet. The current rank comes from the hunter record.</p>}</>;
}

export function ServiceRecord({member,data}:{member:RecordData;data:Dataset}){
 const entries=serviceRecord(member.id,data);
 if(!entries.length)return <p className="empty">No undertakings, duties, history or promotions recorded.</p>;
 const firstUndated=entries.findIndex(e=>!e.date);
 return <ol className={firstUndated===0?'service undated-only':'service'}>{entries.flatMap((e,i)=>[...(i===firstUndated?[<li key="undated" className="service-group">No real-world date recorded</li>]:[]),<li key={`${e.kind}/${e.id}/${e.role}`}>
  {firstUndated!==0&&<span className="service-date">{e.date||''}</span>}
  <div><a href={href(e.kind,e.id)}>{e.title}</a><small>{[e.role,e.era,e.state].filter(Boolean).join(' · ')}</small></div>
 </li>])}</ol>;
}
