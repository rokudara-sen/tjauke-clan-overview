import { ArrowUpRight } from 'lucide-react';
import { active, rankLabel, safeUrl, type Dataset, type RecordData } from './model';
import { href } from './Visuals';

export function HunterGallery({rows,data}:{rows:RecordData[];data:Dataset}) {
 if(!rows.length)return <p className="empty">No hunters match.</p>;
 return <ul className="hunter-gallery">{rows.map(r=>{
  const portrait=safeUrl(r.portrait),house=data.houses.find(h=>h.id===r.house);
  const hunts=active(data.hunts).filter(h=>h.hunter===r.id);
  return <li key={r.id} className="hunter-card"><a className="hunter-cover" href={href('members',r.id)} aria-label={`Open ${r.name}'s profile`}>
   {portrait?<img src={portrait} alt={`Portrait of ${r.name}`} loading="lazy"/>:<div className="hunter-monogram" aria-hidden="true"><span>{String(r.name).slice(0,1)}</span></div>}
   <span className="hunter-status">{r.archived?'Archived':r.status||'Status not recorded'}</span><ArrowUpRight className="hunter-arrow" size={20}/>
  </a><div className="hunter-card-body"><span className="eyebrow">{rankLabel(r)||'Rank not recorded'}</span><h2><a href={href('members',r.id)}>{r.name}</a></h2><div className="hunter-house">{house?<a href={href('houses',house.id)}>{house.name}{house.archived?' (archived)':''}</a>:r.house?'Household reference unavailable':'Household not recorded'}</div><div className="hunter-card-foot"><span>{hunts.length} {hunts.length===1?'undertaking':'undertakings'}</span><a href={href('members',r.id)}>View profile <ArrowUpRight size={13}/></a></div></div></li>;
 })}</ul>;
}
