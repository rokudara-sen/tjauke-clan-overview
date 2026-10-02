import { useCallback, useEffect, useState } from 'react';
import { decidePortrait, dismissPromotion, forumDeleteMessage, forumReports, forumResolveReport, myQueue, pendingPortraits, portraitPreview, promotionSuggestions, queueChanged, type PendingPortrait, type PromotionSuggestion, type Queue, type Report } from './service';
import { safeUrl, type Dataset } from './model';
import { href } from './Visuals';
const scrollTo=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const Result=({error,message}:{error:string;message:string})=><>{error&&<p className="notice error prose" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}</>;
function useAction(reload:()=>Promise<unknown>){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function run(action:()=>Promise<unknown>,done:string){if(busy)return;setBusy(true);setError('');setMessage('');try{await action();setMessage(done);await reload();queueChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return {busy,error,setError,message,run};
}

/** What is waiting for administrators. Each item jumps to the panel that handles it. */
export function WorkSummary({refreshKey,onGlossary}:{refreshKey:number;onGlossary:()=>void}){
 const [q,setQ]=useState<Queue|null>(null);
 useEffect(()=>{const load=()=>myQueue().then(setQ).catch(()=>setQ(null));void load();window.addEventListener('queue-changed',load);return()=>window.removeEventListener('queue-changed',load);},[refreshKey]);
 if(!q)return null;
 const items=[[q.registrations,'registration','registrations','admin-accounts'],[q.portraits,'portrait','portraits','admin-portraits'],[q.reports,'reported message','reported messages','admin-reports'],[q.promotions,'promotion suggestion','promotion suggestions','admin-promotions'],[q.suggestions,'glossary suggestion','glossary suggestions','glossary']] as const;
 const waiting=items.filter(([n])=>n);
 return <div className="work-summary" role="status">{waiting.length?<><span>Waiting:</span>{waiting.map(([n,one,many,target])=><button key={target} className="text-button" onClick={()=>target==='glossary'?onGlossary():scrollTo(target)}>{plural(n!,one,many)}</button>)}</>:<span>Nothing is waiting for review.</span>}</div>;
}

export function PortraitReview(){
 const [rows,setRows]=useState<(PendingPortrait&{preview?:string})[]|null>(null);
 const load=useCallback(async()=>{const list=await pendingPortraits();setRows(await Promise.all(list.map(async p=>({...p,preview:await portraitPreview(p.path).catch(()=>undefined)}))));},[]);
 const {busy,error,setError,message,run}=useAction(load);
 useEffect(()=>{load().catch(e=>setError((e as Error).message));},[load,setError]);
 return <section className="panel accounts" id="admin-portraits"><h2>Portraits waiting</h2><p className="section-note">Approving copies the image to the public store and puts it on the hunter’s profile. Rejecting deletes the upload.</p><Result error={error} message={message}/>
  {rows===null?!error&&<p role="status">Loading portraits…</p>:rows.length?<ul className="portrait-queue">{rows.map(p=><li key={p.id}>
   {p.preview?<img className="portrait" src={p.preview} alt={`Uploaded portrait for ${p.name}`}/>:<div className="portrait empty-portrait">Preview unavailable</div>}
   <div><a className="record-title" href={href('members',p.member)}>{p.name}</a><small>Uploaded {new Date(p.created_at).toLocaleDateString()}{safeUrl(p.current)?' · replaces the current portrait':''}</small>
   <div className="form-actions"><button className="primary" disabled={busy} onClick={()=>void run(()=>decidePortrait(p,true),`Portrait for ${p.name} approved.`)}>Approve</button><button disabled={busy} onClick={()=>void run(()=>decidePortrait(p,false),`Portrait for ${p.name} rejected.`)}>Reject</button></div></div>
  </li>)}</ul>:<p className="empty">No portraits waiting.</p>}
 </section>;
}

export function PromotionSuggestions({data,onRecord}:{data:Dataset;onRecord:(s:PromotionSuggestion)=>void}){
 const [rows,setRows]=useState<PromotionSuggestion[]|null>(null);
 const load=useCallback(()=>promotionSuggestions().then(setRows),[]);
 const {busy,error,setError,message,run}=useAction(load);
 useEffect(()=>{load().catch(e=>setError((e as Error).message));},[load,data,setError]);
 const name=(id:string)=>data.members.find(m=>m.id===id)?.name||id;
 return <section className="panel accounts" id="admin-promotions"><h2>Promotion suggestions</h2><p className="section-note">Accepted claims with no rank history entry citing them. Recording a promotion does not change the hunter’s current rank; edit the hunter record for that.</p><Result error={error} message={message}/>
  {rows===null?!error&&<p role="status">Loading suggestions…</p>:rows.length?<ul className="record-list">{rows.map(s=><li key={s.hunt}><div><a className="record-title" href={href('hunts',s.hunt)}>{s.name}</a><small>{[name(s.hunter),s.date||s.era,s.trophy&&`trophy: ${s.trophy}`].filter(Boolean).join(' · ')}</small></div>
   <div className="account-actions"><button className="primary" disabled={busy} onClick={()=>onRecord(s)}>Record promotion</button><button disabled={busy} onClick={()=>void run(()=>dismissPromotion(s.hunt),`${s.name} dismissed. It will not be suggested again.`)}>Not a promotion</button></div></li>)}</ul>:<p className="empty">No accepted claims are waiting.</p>}
 </section>;
}

export function Reports(){
 const [rows,setRows]=useState<Report[]|null>(null);
 const load=useCallback(()=>forumReports().then(setRows),[]);
 const {busy,error,setError,message,run}=useAction(load);
 useEffect(()=>{load().catch(e=>setError((e as Error).message));},[load,setError]);
 return <section className="panel accounts" id="admin-reports"><h2>Reported messages</h2><Result error={error} message={message}/>
  {rows===null?!error&&<p role="status">Loading reports…</p>:rows.length?<ul className="record-list">{rows.map(r=><li key={r.id}><div><a className="record-title" href={href('forum',r.thread)}>{r.title}</a><small>{r.author||'Removed account'} wrote, reported by {r.reporter||'a removed account'}: {r.reason}</small><p className="prose report-body">{r.body}</p></div>
   <div className="account-actions"><button disabled={busy} onClick={()=>{if(confirm('Delete this message?'))void run(()=>forumDeleteMessage(r.message),'Message deleted.');}}>Delete message</button><button disabled={busy} onClick={()=>void run(()=>forumResolveReport(r.id),'Report dismissed. The message stays.')}>Keep message</button></div></li>)}</ul>:<p className="empty">No open reports.</p>}
 </section>;
}
