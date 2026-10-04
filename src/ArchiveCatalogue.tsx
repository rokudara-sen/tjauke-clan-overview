import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { active, hallTrophies, ordered, safeUrl, type Dataset, type Kind, type RecordData } from './model';
import { href } from './Visuals';
import { reducedMotion } from './gl';
import { setDock } from './dock';
import { Cosmos } from './Cosmos';

const entries:{route:string;title:string;kind?:Kind}[]=[
 {route:'members',title:'Hunters',kind:'members'},{route:'houses',title:'Households',kind:'houses'},
 {route:'hunts',title:'Undertakings',kind:'hunts'},{route:'trophies',title:'Trophy hall',kind:'trophies'},
 {route:'chronicle',title:'History',kind:'chronicle'},{route:'duties',title:'Duties',kind:'duties'},
 {route:'politics',title:'Politics',kind:'clans'},{route:'library',title:'Documents',kind:'library'},
 {route:'glossary',title:'Glossary',kind:'glossary'},{route:'forum',title:'Forum'},
];
const rowsOf=(i:number,data:Dataset):RecordData[]=>{const k=entries[i].kind;return k?(k==='trophies'?hallTrophies(data):ordered(active(data[k]))):[];};
const imageOf=(i:number,rows:RecordData[])=>{const k=entries[i].kind;return k==='trophies'?safeUrl(rows.find(r=>safeUrl(r.image))?.image):k==='members'?safeUrl(rows.find(r=>safeUrl(r.portrait))?.portrait):null;};
const pad=(n:number)=>String(n).padStart(2,'0');

/** Counts up to a new value whenever it changes. */
function useTicker(value:number){
 const [shown,setShown]=useState(value);const from=useRef(value);
 useEffect(()=>{if(reducedMotion()){setShown(value);from.current=value;return;}
  const start=performance.now(),a=from.current;let f=0;
  const run=(now:number)=>{const t=Math.min(1,(now-start)/600),e=1-(1-t)**3,v=Math.round(a+(value-a)*e);setShown(v);from.current=v;if(t<1)f=requestAnimationFrame(run);};
  f=requestAnimationFrame(run);return()=>cancelAnimationFrame(f);},[value]);
 return shown;
}

function Cover({index,data,ready,status,phase,dir}:{index:number;data:Dataset;ready:boolean;status:string;phase:'in'|'out';dir:number}){
 const e=entries[index],rows=rowsOf(index,data),image=imageOf(index,rows),card=useRef<HTMLAnchorElement>(null);
 // The cover leans towards the pointer and a highlight follows it across the surface.
 const lean=(ev:PointerEvent<HTMLAnchorElement>)=>{const el=card.current;if(!el||reducedMotion())return;const b=el.getBoundingClientRect(),x=(ev.clientX-b.left)/b.width,y=(ev.clientY-b.top)/b.height;
  el.style.setProperty('--rx',`${(.5-y)*14}deg`);el.style.setProperty('--ry',`${(x-.5)*16}deg`);el.style.setProperty('--gx',`${x*100}%`);el.style.setProperty('--gy',`${y*100}%`);};
 const rest=()=>{const el=card.current;if(!el)return;el.style.setProperty('--rx','0deg');el.style.setProperty('--ry','0deg');};
 return <a ref={card} href={href(e.route)} data-label={e.title} className={`catalogue-cover cover-${e.route} cover-${phase}`} style={{['--dir' as string]:dir}} aria-label={`Open ${e.title.toLowerCase()}`} tabIndex={phase==='out'?-1:undefined} aria-hidden={phase==='out'||undefined} onPointerMove={lean} onPointerLeave={rest}>
  {image&&<img src={image} alt=""/>}<span className="cover-glare" aria-hidden="true"/><span className="cover-clan">TJAU’KE / CLAN ARCHIVE</span>
  <span className="cover-title" aria-hidden="true" style={{['--len' as string]:Math.max(...e.title.split(' ').map(w=>w.length))}}>{e.title.split(' ').map((word,w,all)=>{const before=all.slice(0,w).join(' ').length+(w?1:0);return <span className="cover-word" key={w}>{[...word].map((c,i)=><span key={i} style={{animationDelay:`${.12+(before+i)*.028}s`}}>{c}</span>)}</span>;})}</span><span className="sr-only">{e.title}</span>
  <span className="cover-records">{ready?rows.slice(0,3).map((r,i)=><span key={r.id} style={{animationDelay:`${.3+i*.07}s`}}>{r.name}</span>):status==='loading'?'Loading records…':'Records unavailable'}</span><span className="cover-open">Open section ↗</span>
 </a>;
}

export function ArchiveCatalogue({data,status}:{data:Dataset;status:string}){
 const ready=status==='ready';
 const [selected,setSelected]=useState(0),[leaving,setLeaving]=useState<{index:number;dir:number;key:number}|null>(null),[dir,setDir]=useState(1);
 const root=useRef<HTMLElement>(null),current=useRef(0),stamp=useRef(0),mark=useRef<HTMLElement>(null),[struck,setStruck]=useState(false);
 // A star arriving here lands on the section number in the heading.
 useEffect(()=>setDock({point:()=>{const r=mark.current?.getBoundingClientRect();return r&&r.width?{x:r.left-10,y:r.top+r.height/2}:null;},land:()=>setStruck(true)}),[]);
 const rows=rowsOf(selected,data),count=useTicker(ready?rows.length:0);
 // Moving between sections keeps the old cover long enough to animate it out in the direction of travel.
 const go=(next:number,direction:number)=>{const n=(next+entries.length)%entries.length;if(n===current.current)return;
  setLeaving({index:current.current,dir:direction,key:++stamp.current});setDir(direction);current.current=n;setSelected(n);};
 const step=(n:number)=>go(current.current+n,n>0?1:-1);
 useEffect(()=>{if(!leaving)return;const t=setTimeout(()=>setLeaving(l=>l&&l.key===leaving.key?null:l),reducedMotion()?0:600);return()=>clearTimeout(t);},[leaving]);
 // One wheel gesture moves one section. A trackpad swipe keeps sending events while it coasts, so a gesture
 // ends only after a short pause, and a long swipe never skips past several sections.
 useEffect(()=>{const el=root.current!;let sum=0,spent=false,pause=0;
  const onWheel=(e:WheelEvent)=>{if(innerHeight<700)return;e.preventDefault();clearTimeout(pause);pause=window.setTimeout(()=>{sum=0;spent=false;},220);
   if(spent)return;sum+=e.deltaY*(e.deltaMode===1?30:1);if(Math.abs(sum)<40)return;spent=true;step(sum>0?1:-1);};
  el.addEventListener('wheel',onWheel,{passive:false});return()=>{clearTimeout(pause);el.removeEventListener('wheel',onWheel);};},[]);
 const e=entries[selected];
 return <section ref={root} className="archive-catalogue" style={{['--index' as string]:selected}} aria-label="Browse archive sections" tabIndex={0} onKeyDown={ev=>{if(ev.target!==ev.currentTarget)return;if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(ev.key)){ev.preventDefault();step(ev.key==='ArrowDown'||ev.key==='ArrowRight'?1:-1);}}}>
  <Cosmos intensity={.6}/>
  <div className="catalogue-ruler ruler-top" aria-hidden="true"/><div className="catalogue-ruler ruler-left" aria-hidden="true"/>
  <div className="catalogue-ghost" aria-hidden="true" key={`g${selected}`} style={{['--dir' as string]:dir}}>{pad(selected+1)}</div>
  <div className="catalogue-heading"><h1>Catalogue</h1><span ref={mark} className={struck?'is-struck':undefined}><b key={selected}>{pad(selected+1)}</b> / {pad(entries.length)} sections</span></div>
  <div className="catalogue-axis axis-x" aria-hidden="true"/><div className="catalogue-axis axis-y" aria-hidden="true"/>
  <div className="catalogue-stage">
   <div className="catalogue-description" aria-live="polite" key={`d${selected}`}><span>[ SECTION {pad(selected+1)} ]</span><h2>{e.title}</h2><small>{e.kind?(ready?`${count} published ${rows.length===1?'record':'records'}`:status==='loading'?'Loading records…':'Records unavailable'):'Community discussion'}</small></div>
   <div className="catalogue-covers">
    {leaving&&<Cover key={`out${leaving.key}`} index={leaving.index} data={data} ready={ready} status={status} phase="out" dir={leaving.dir}/>}
    <Cover key={`in${selected}`} index={selected} data={data} ready={ready} status={status} phase="in" dir={dir}/>
   </div>
   <div className="catalogue-list" aria-label="Section selector">{entries.map((entry,i)=><button type="button" key={entry.route} aria-pressed={i===selected} onClick={()=>go(i,i>selected?1:-1)}>{entry.title}</button>)}</div>
  </div>
  <button className="catalogue-prev" type="button" onClick={()=>step(-1)}>← Previous</button><button className="catalogue-next" type="button" onClick={()=>step(1)}>Next →</button>
  <div className="catalogue-bottom"><a href={href('dashboard')}>← Return home</a><span>One section at a time<span className="catalogue-keys"> · Scroll or use the arrow keys</span> · Select the cover to open</span></div>
 </section>;
}
