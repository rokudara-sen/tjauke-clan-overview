import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { client, forumCreateThread, forumDeleteMessage, forumModerate, forumPost, forumThread, forumThreads, myAccess, type Access, type ForumSettings, type Thread, type ThreadSummary } from './service';
import { href } from './Visuals';
const POLL_MS=5000,MAX=2000;
const when=(iso:string)=>{const d=new Date(iso);return d.toDateString()===new Date().toDateString()?d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):d.toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};
const limits=(s:ForumSettings)=>`Messages are deleted after ${s.retention_days} ${s.retention_days===1?'day':'days'}. Each thread keeps its newest ${s.thread_cap}.`;

/** Members-only forum. Access is checked by the database; this only decides what to show. */
export function Forum({threadId}:{threadId?:string}){
 const [access,setAccess]=useState<Access|'signed-out'|'error'|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!client)return;let alive=true;const check=async()=>{try{const {data:{session}}=await client!.auth.getSession();if(!session){if(alive)setAccess('signed-out');return;}const a=await myAccess();if(alive)setAccess(a);}catch(e){if(alive){setError((e as Error).message);setAccess('error');}}};void check();const {data:listener}=client.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>void check(),0);});return()=>{alive=false;listener.subscription.unsubscribe();};},[]);
 if(!client)return <section className="panel setup"><h2>The forum is not available in this preview</h2><p>It needs the connected Supabase project.</p></section>;
 if(access===null)return <p role="status">Checking your account…</p>;
 if(access==='error')return <p className="notice error prose" role="alert">{error}</p>;
 if(access==='signed-out')return <section className="panel login"><h2>Members only</h2><p>The forum is open to approved accounts.</p><div className="form-actions"><a className="button-link" href={href('account')}>Sign in</a><a className="button-link" href={href('register')}>Request an account</a></div></section>;
 if(access.status!=='approved'&&!access.admin)return <section className="panel login"><h2>Members only</h2><p>{access.status==='pending'?'Your account is waiting for an administrator’s approval.':'This account cannot use the forum.'}</p><a className="button-link" href={href('account')}>Your account</a></section>;
 if(!access.username)return <section className="panel login"><h2>Choose a username first</h2><p>Forum posts show your username.</p><a className="button-link" href={href('account')}>Choose a username</a></section>;
 return threadId?<ThreadView key={threadId} id={threadId} admin={access.admin}/>:<ThreadList/>;
}

function ThreadList(){
 const [list,setList]=useState<{settings:ForumSettings;threads:ThreadSummary[]}|null>(null),[error,setError]=useState(''),[composing,setComposing]=useState(false),[title,setTitle]=useState(''),[body,setBody]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>forumThreads().then(l=>{setList(l);setError('');}).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load();const t=setInterval(()=>{if(document.visibilityState==='visible')void load();},POLL_MS*3);return()=>clearInterval(t);},[load]);
 async function start(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const id=await forumCreateThread(title.trim(),body.trim());location.hash=href('forum',id);}catch(e){setError((e as Error).message);setBusy(false);}}
 return <>{list&&<p className="summary">{limits(list.settings)}</p>}
  {error&&<p className="notice error prose" role="alert">{error}</p>}
  <section className="section"><div className="section-heading"><h2>Threads</h2>{!composing&&<button onClick={()=>setComposing(true)}>Start a thread</button>}</div>
   {composing&&<form className="panel composer" onSubmit={start}><fieldset disabled={busy}><label>Title *<input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} autoFocus/></label><label>First message *<textarea rows={4} required maxLength={MAX} value={body} onChange={e=>setBody(e.target.value)}/></label><div className="form-actions"><button className="primary" type="submit">{busy?'Starting…':'Start thread'}</button><button type="button" onClick={()=>setComposing(false)}>Cancel</button></div></fieldset></form>}
   {!list?!error&&<p role="status">Loading threads…</p>:list.threads.length?<ul className="record-list">{list.threads.map(t=><li key={t.id}><div><a className="record-title" href={href('forum',t.id)}>{t.title}</a><small>{[t.started_by?`Started by ${t.started_by}`:'Starter account removed',`${t.messages} ${t.messages===1?'message':'messages'}`,`last post ${when(t.last_post_at)}`].join(' · ')}</small></div>{t.locked&&<span className="tag">Locked</span>}</li>)}</ul>:<p className="empty">No threads yet. Start the first one.</p>}
  </section></>;
}

function ThreadView({id,admin}:{id:string;admin:boolean}){
 const [thread,setThread]=useState<Thread|null>(null),[error,setError]=useState(''),[gone,setGone]=useState(false),[body,setBody]=useState(''),[busy,setBusy]=useState(false);
 const list=useRef<HTMLOListElement>(null),stick=useRef(true);
 const load=useCallback(async()=>{try{const t=await forumThread(id);const el=list.current;stick.current=!el||el.scrollHeight-el.scrollTop-el.clientHeight<80;setThread(t);setError('');}catch(e){const m=(e as Error).message;if(/no longer exists/.test(m))setGone(true);setError(m);}},[id]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(gone)return;const t=setInterval(()=>{if(document.visibilityState==='visible')void load();},POLL_MS);const onVisible=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(t);document.removeEventListener('visibilitychange',onVisible);};},[load,gone]);
 // Follow new messages only when the reader is already at the end.
 useEffect(()=>{const el=list.current;if(el&&stick.current)el.scrollTop=el.scrollHeight;},[thread]);
 async function act(action:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await action();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function send(e?:FormEvent){e?.preventDefault();const text=body.trim();if(!text||busy)return;stick.current=true;await act(async()=>{await forumPost(id,text);setBody('');});}
 const keys=(e:KeyboardEvent)=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}};
 const back=<a className="back" href={href('forum')}>Forum</a>;
 if(gone)return <>{back}<div className="state"><h2>Thread unavailable</h2><p>It was deleted, or all of its messages expired.</p></div></>;
 if(!thread)return <>{back}{error?<p className="notice error prose" role="alert">{error}</p>:<p role="status">Loading thread…</p>}</>;
 const atCap=thread.messages.length>=thread.settings.thread_cap,closed=thread.locked&&!admin;
 return <>{back}
  <div className="thread-head"><h2>{thread.title}{thread.locked&&<span className="tag">Locked</span>}</h2>{admin&&<div className="form-actions"><button disabled={busy} onClick={()=>void act(()=>forumModerate(id,thread.locked?'unlock':'lock'))}>{thread.locked?'Unlock thread':'Lock thread'}</button><button disabled={busy} onClick={()=>{if(confirm(`Delete “${thread.title}” and all its messages?`))void act(async()=>{await forumModerate(id,'delete');location.hash=href('forum');});}}>Delete thread</button></div>}</div>
  <p className="section-note">{limits(thread.settings)}{atCap&&' This thread is at the limit, so each new message removes the oldest one.'}</p>
  {error&&<p className="notice error prose" role="alert">{error}</p>}
  {thread.messages.length?<ol className="messages" ref={list} tabIndex={0} aria-label="Messages" aria-live="polite">{thread.messages.map(m=><li key={m.id} className={m.mine?'mine':undefined}>
   <div className="message-meta"><strong>{m.username||'Removed account'}</strong>{m.member&&<a href={href('members',m.member)}>{m.member_name}</a>}<time dateTime={m.created_at}>{when(m.created_at)}</time>{m.can_delete&&<button className="text-button" disabled={busy} onClick={()=>{if(confirm('Delete this message?'))void act(()=>forumDeleteMessage(m.id));}}>Delete<span className="sr-only"> message from {when(m.created_at)}</span></button>}</div>
   <p className="prose">{m.body}</p>
  </li>)}</ol>:<p className="empty">No messages left in this thread.</p>}
  {closed?<p className="notice">This thread is locked.</p>:<form className="composer" onSubmit={send}><label>Your message<textarea rows={3} maxLength={MAX} value={body} onChange={e=>setBody(e.target.value)} onKeyDown={keys} aria-describedby="composer-note"/></label><div className="composer-foot"><small id="composer-note">Ctrl+Enter to send{body.length>MAX-200?` · ${MAX-body.length} characters left`:''}</small><button className="primary" disabled={busy||!body.trim()}>{busy?'Posting…':'Post message'}</button></div></form>}
 </>;
}
