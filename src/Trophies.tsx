import { useState, type ReactNode } from 'react';
import { active, hallTrophies, normalize, safeUrl, schemas, type Dataset, type RecordData } from './model';
import { href } from './Visuals';

const origins=schemas.trophies.fields.find(f=>f.key==='origin')!.options!;
const when=(t:RecordData)=>String(t.era||t.date||'');

/** Image of the trophy, or an empty frame saying none is recorded. */
function Frame({trophy}:{trophy:RecordData}){
 const image=safeUrl(trophy.image);
 return <div className="trophy-frame">{image?<img src={image} alt={`${trophy.name}`} loading="lazy"/>:<span>No image recorded</span>}</div>;
}

/** Who took or earned it, with their household. */
function Holder({trophy,data}:{trophy:RecordData;data:Dataset}){
 const m=data.members.find(m=>m.id===trophy.hunter),house=m&&data.houses.find(h=>h.id===m.house);
 if(!m)return <span className="muted">{trophy.hunter?`Missing reference: ${String(trophy.hunter)}`:'Hunter not recorded'}</span>;
 return <><a href={href('members',m.id)}>{m.name}</a>{house&&<> of <a href={href('houses',house.id)}>{house.name}</a></>}</>;
}

function Featured({trophy,data}:{trophy:RecordData;data:Dataset}){
 const hunt=trophy.hunt?data.hunts.find(h=>h.id===trophy.hunt):undefined;
 const facts:[string,ReactNode][]=([['Hunted or earned by',<Holder trophy={trophy} data={data}/>],['How it was earned',trophy.origin],['Taken from',trophy.quarry],
  ['Undertaking',hunt&&<a href={href('hunts',hunt.id)}>{hunt.name}</a>],['When',when(trophy)],['Where it is kept',trophy.kept]] as [string,ReactNode][]).filter(([,v])=>v);
 return <article className="trophy-featured">
  <Frame trophy={trophy}/>
  <div>
   <h2><a href={href('trophies',trophy.id)}>{trophy.name}</a></h2>
   <p className="prose">{trophy.description}</p>
   <dl className="specs">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   {trophy.significance&&<p className="trophy-why"><span>Why it is kept</span>{trophy.significance}</p>}
  </div>
 </article>;
}

function Card({trophy,data}:{trophy:RecordData;data:Dataset}){
 return <li className="trophy-card">
  <Frame trophy={trophy}/>
  <div>
   <h3><a href={href('trophies',trophy.id)}>{trophy.name}</a></h3>
   <small><Holder trophy={trophy} data={data}/></small>
   {trophy.description&&<p>{trophy.description}</p>}
   <span className="tag">{[trophy.origin,when(trophy)].filter(Boolean).join(' · ')}</span>
  </div>
 </li>;
}

/** The clan's curated trophies. The first in display order leads the page while no filter is set. */
export function TrophyHall({data}:{data:Dataset}){
 const [query,setQuery]=useState(''),[origin,setOrigin]=useState(''),[house,setHouse]=useState('');
 const all=hallTrophies(data),houseOf=(t:RecordData)=>String(data.members.find(m=>m.id===t.hunter)?.house||'');
 const houses=active(data.houses).filter(h=>all.some(t=>houseOf(t)===h.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 const q=normalize(query),filtered=!!(q||origin||house);
 const rows=all.filter(t=>(!q||normalize(t.name).includes(q)||normalize(t.quarry).includes(q)||normalize(data.members.find(m=>m.id===t.hunter)?.name).includes(q))&&(!origin||t.origin===origin)&&(!house||houseOf(t)===house));
 const lead=filtered?undefined:rows[0],rest=lead?rows.slice(1):rows;
 return <>
  <p className="summary">Trophies the clan keeps on display. Every accepted claim stays listed with its <a href={href('hunts')}>undertaking</a>.</p>
  {all.length>0&&<div className="filters"><label>Search trophies<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Trophy, quarry or hunter"/></label>
   <label>How it was earned<select value={origin} onChange={e=>setOrigin(e.target.value)}><option value="">All</option>{origins.filter(o=>all.some(t=>t.origin===o)).map(o=><option key={o}>{o}</option>)}</select></label>
   {houses.length>1&&<label>Household<select value={house} onChange={e=>setHouse(e.target.value)}><option value="">All</option>{houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>}</div>}
  {!all.length?<p className="empty">No trophies are on display yet.</p>:!rows.length?<p className="empty">No trophies match.</p>:<>
   {lead&&<Featured trophy={lead} data={data}/>}
   {rest.length>0&&<ul className="trophy-grid" aria-label={filtered?'Matching trophies':'More trophies'}>{rest.map(t=><Card key={t.id} trophy={t} data={data}/>)}</ul>}
  </>}
 </>;
}
