import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { client, deleteMyAccount, myPortrait, mySuggestions, portraitTypes, queueChanged, respondWitness, suggestTerm, uploadPortrait, witnessRequests, type Portrait, type WitnessRequest } from './service';
import { safeUrl } from './model';
import { href } from './Visuals';
export function Group({title,action,children,id}:{title:string;action?:ReactNode;children:ReactNode;id?:string}){return <section className="section" id={id}><div className="section-heading"><h2>{title}</h2>{action}</div>{children}</section>;}
const Result=({error,message}:{error:string;message:string})=><>{error&&<p className="notice error prose" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}</>;

/** Undertakings that name this hunter as witness and are not yet judged. Hidden when there are none. */
export function WitnessRequests({onChanged}:{onChanged:()=>void}){
 const [rows,setRows]=useState<WitnessRequest[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(()=>witnessRequests().then(setRows).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load();},[load]);
 async function answer(r:WitnessRequest,accept:boolean){if(busy)return;setBusy(true);setError('');setMessage('');try{await respondWitness(r.id,accept);setMessage(accept?`You confirmed witnessing ${r.name}.`:`You declined to witness ${r.name}.`);await load();queueChanged();onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!error&&!message&&!rows?.length)return null;
 return <Group title="Witness requests"><p className="section-note">These undertakings name you as witness. Confirm only if you witnessed, or will witness, the hunt.</p><Result error={error} message={message}/>
  {rows&&<ul className="record-list">{rows.map(r=><li key={r.id}><div><span className="record-title">{r.name}</span><small>{[r.hunter,r.date||r.era,r.state].filter(Boolean).join(' · ')}</small><p>{r.quarry}</p></div><div className="account-actions">{r.witness_status&&r.witness_status!=='Requested'&&<span className="tag">{r.witness_status}</span>}<button className={r.witness_status==='Confirmed'?undefined:'primary'} disabled={busy||r.witness_status==='Confirmed'} onClick={()=>void answer(r,true)}>Confirm</button><button disabled={busy||r.witness_status==='Declined'} onClick={()=>void answer(r,false)}>Decline</button></div></li>)}</ul>}
 </Group>;
}

export function PortraitUpload({member,current}:{member:string;current:unknown}){
 const [portrait,setPortrait]=useState<Portrait|null|undefined>(undefined),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(()=>myPortrait().then(setPortrait).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load();},[load]);
 async function upload(e:FormEvent){e.preventDefault();if(!file||busy)return;setBusy(true);setError('');setMessage('');try{await uploadPortrait(member,file);setFile(null);(e.target as HTMLFormElement).reset();setMessage('Portrait sent. It appears on your profile once an administrator approves it.');await load();queueChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const shown=safeUrl(current);
 return <Group title="Portrait"><div className="portrait-row">{shown?<img className="portrait small" src={shown} alt="Your current portrait"/>:<div className="portrait small empty-portrait" aria-hidden="true"/>}<div>
  <p className="section-note">{portrait?.status==='pending'?`A new portrait has been waiting for approval since ${new Date(portrait.created_at).toLocaleDateString()}. Uploading again replaces it.`:portrait?.status==='rejected'?'Your last upload was not approved.':shown?'This portrait is on your public profile.':'No portrait yet.'} JPEG, PNG or WebP, up to 2 MB.</p>
  <Result error={error} message={message}/>
  <form className="portrait-form" onSubmit={upload}><fieldset disabled={busy}><label>Image<input type="file" accept={portraitTypes.join(',')} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="primary" disabled={!file}>{busy?'Uploading…':'Send for approval'}</button></fieldset></form>
 </div></div></Group>;
}

export function SuggestTerm(){
 const empty={term:'',meaning:'',category:'',usage:''};
 const [form,setForm]=useState(empty),[mine,setMine]=useState<{id:string;name:string;published:boolean;archived:boolean}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(()=>mySuggestions().then(setMine).catch(()=>setMine([])),[]);
 useEffect(()=>{void load();},[load]);
 const set=(k:keyof typeof empty)=>(e:{target:{value:string}})=>setForm(f=>({...f,[k]:e.target.value}));
 async function send(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');try{await suggestTerm(form.term,form.meaning,form.category,form.usage);setForm(empty);setMessage('Suggestion sent. An administrator reviews it before it appears in the glossary.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="password"><summary>Suggest a glossary term</summary><form onSubmit={send}><p className="section-note">Suggestions start as provisional and appear in the <a href={href('glossary')}>glossary</a> once an administrator publishes them.</p><Result error={error} message={message}/>
  <fieldset disabled={busy}><label>Term *<input required maxLength={80} value={form.term} onChange={set('term')}/></label><label>Working meaning *<input required maxLength={200} value={form.meaning} onChange={set('meaning')}/></label><label>Category<input maxLength={60} value={form.category} onChange={set('category')}/></label><label>Usage notes<textarea rows={3} maxLength={2000} value={form.usage} onChange={set('usage')}/></label><button className="primary">{busy?'Sending…':'Send suggestion'}</button></fieldset>
  {mine.length>0&&<ul className="record-list compact">{mine.map(s=><li key={s.id}>{s.published?<a href={href('glossary',s.id)}>{s.name}</a>:<span>{s.name}</span>}<span className="tag">{s.published?'Published':s.archived?'Not accepted':'Waiting'}</span></li>)}</ul>}
 </form></details>;
}

export function DeleteAccount({username,admin}:{username:string|null;admin:boolean}){
 const [typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function remove(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await deleteMyAccount(typed);await client!.auth.signOut();location.hash='#/';}catch(e){setError((e as Error).message);setBusy(false);}}
 return <details className="password danger-zone"><summary>Delete account</summary>{admin?<p className="section-note">Administrator accounts cannot be deleted here. Remove administrator access in Supabase first.</p>:!username?<p className="section-note">Choose a username first; you confirm deletion by typing it.</p>:<form onSubmit={remove}>
  <p className="section-note">This removes your sign-in, username and hunter link for good. Hunter records stay in the archive. Your forum messages stay without a name until they expire.</p><Result error={error} message=""/>
  <fieldset disabled={busy}><label>Type <strong>{username}</strong> to confirm<input autoComplete="off" required value={typed} onChange={e=>setTyped(e.target.value)}/></label><button className="danger" disabled={typed.trim().toLowerCase()!==username.toLowerCase()}>{busy?'Deleting…':'Delete my account'}</button></fieldset>
 </form>}</details>;
}
