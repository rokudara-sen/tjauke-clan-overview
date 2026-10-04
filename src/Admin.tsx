import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, exportBackup, forumConfigure, forumThreads, listAccounts, loadData, myQueue, queueChanged, renameAccount, reviewAccount, saveRecord, supersedeRelation, usernamePattern, type AccountRow, type PromotionSuggestion, type Queue } from './service';
import { PortraitReview, PromotionSuggestions, Reports } from './AdminExtras';
import { active, emptyData, kinds, schemas, standingConferred, validate, type Dataset, type Kind, type RecordData } from './model';
import { FieldInput } from './Fields';
import { Drawer, ReasonField, StatusSwitch, TabPanel, Tabs, pathAfterTab, plural, shortDate, statusOf, useTab, useToast, type Status } from './Workspace';
const newId=(kind:Kind)=>`${schemas[kind].prefix}-${crypto.randomUUID()}`;

/** Record types grouped as the public archive groups them. */
const groups:[string,Kind[]][]=[['Clan',['members','houses','duties','promotions']],['Hunts',['hunts','trophies']],['Records',['chronicle','library','glossary']],['Politics',['clans','relations']],['Site',['settings']]];
const tabs=['inbox','records','accounts','forum'] as const;
type Tab=typeof tabs[number];
type Filter='all'|Status;
const filters:[Filter,string][]=[['all','All'],['published','Published'],['draft','Drafts'],['archived','Archived']];
const reasons=['Correction','New information','Wording','Formatting'];

/** A change note that writes itself when the change speaks for itself. */
function obviousReason(before:RecordData|null,after:RecordData){
 if(!before)return 'Added';
 const rest=(r:RecordData)=>JSON.stringify({...r,published:null,archived:null});
 if(rest(before)!==rest(after))return '';
 if(before.archived!==after.archived)return after.archived?'Archived':'Restored';
 if(before.published!==after.published)return after.published?'Published':'Unpublished';
 return '';
}

export function Admin({onChanged}:{onChanged:()=>void}){
 const [access,setAccess]=useState<'checking'|'signed-out'|'denied'|'admin'>('checking'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[data,setData]=useState<Dataset>(emptyData);
 const [tab,setTab]=useTab<Tab>('admin',tabs,'inbox');
 const [kind,setKind]=useState<Kind>(()=>{const k=pathAfterTab()[0] as Kind;return kinds.includes(k)?k:'members';});
 const [query,setQuery]=useState(''),[filter,setFilter]=useState<Filter>('all');
 const [row,setRow]=useState<RecordData|null>(null),[original,setOriginal]=useState<RecordData|null>(null),[replacing,setReplacing]=useState<RecordData|null>(null);
 const [reason,setReason]=useState(''),[reasonTyped,setReasonTyped]=useState(false),[queue,setQueue]=useState<Queue|null>(null);
 const [toastNode,toast]=useToast();
 useEffect(()=>{if(!client)return;let alive=true;let generation=0;const check=async()=>{const current=++generation;setAccess('checking');setData(emptyData());setRow(null);try{const {data:{session},error:sessionError}=await client!.auth.getSession();if(sessionError)throw sessionError;if(!session){if(alive&&current===generation)setAccess('signed-out');return;}const {data:allowed,error}=await client!.rpc('is_admin');if(error)throw error;if(!allowed){if(alive&&current===generation)setAccess('denied');return;}const records=await loadData(true);if(alive&&current===generation){setData(records);setAccess('admin');}}catch(e){if(alive&&current===generation){setError((e as Error).message);setAccess('denied');}}};void check();const {data:listener}=client.auth.onAuthStateChange(()=>{setTimeout(()=>void check(),0);});return()=>{alive=false;listener.subscription.unsubscribe();};},[]);
 useEffect(()=>{if(access!=='admin')return;const load=()=>myQueue().then(setQueue).catch(()=>setQueue(null));void load();window.addEventListener('queue-changed',load);return()=>window.removeEventListener('queue-changed',load);},[access]);
 const existing=!!row&&data[kind].some(r=>r.id===row.id);
 const dirty=!!row&&JSON.stringify(row)!==JSON.stringify(original??{id:row.id,archived:false,published:false});
 // Until the note is typed, it follows what the change obviously is.
 useEffect(()=>{if(row&&!reasonTyped)setReason(replacing?'Stance reassessed':obviousReason(original,row));},[row,original,replacing,reasonTyped]);
 const guard=(next:()=>void)=>{if(!dirty||confirm('Discard your unsaved changes?'))next();};
 function open(next:RecordData|null,old:RecordData|null=null,from:RecordData|null=null){setRow(next);setOriginal(from);setReplacing(old);setReason('');setReasonTyped(false);setError('');}
 const pickKind=(k:Kind)=>guard(()=>{setKind(k);setQuery('');setFilter('all');open(null);setTab('records',k);});
 async function signIn(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const {error}=await client!.auth.signInWithPassword({email,password});if(error)throw error;setPassword('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();if(!row||busy)return;setError('');
  // While superseding, the old assessment is archived in the same transaction, so it does not count as a duplicate direction.
  const errors=validate(kind,row,replacing?{...data,relations:data.relations.filter(r=>r.id!==replacing.id)}:data);if(!reason.trim())errors.push('Add a change note.');if(errors.length){setError(errors.join('\n'));return;}
  setBusy(true);try{if(replacing)await supersedeRelation(replacing,row,reason);else await saveRecord(kind,row,reason);const name=String(row.name||'Record');open(null);queueChanged();toast(replacing?`New assessment saved. The earlier one stays in its history.`:`${name} saved.`);onChanged();setData(await loadData(true));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function recordPromotion(s:PromotionSuggestion){const hunter=data.members.find(m=>m.id===s.hunter);setKind('promotions');setTab('records','promotions');open({id:newId('promotions'),archived:false,published:false,name:`${hunter?.name||'Hunter'} after ${s.name}`,member:s.hunter,rank:'Blooded',hunt:s.hunt,date:s.date||'',era:s.era||''});}
 async function backup(){setBusy(true);setError('');try{const payload=await exportBackup();const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`tjauke-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup downloaded.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const shown=useMemo(()=>{const q=query.trim().toLowerCase();return data[kind].filter(r=>filter==='all'||statusOf(r)===filter).filter(r=>!q||String(r.name||'').toLowerCase().includes(q)||r.id.toLowerCase().includes(q)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));},[data,kind,query,filter]);
 if(!client)return <section className="panel setup"><h2>Administrator access is not configured</h2><p>The public preview uses a local workbook snapshot. Saving requires a Supabase project and an approved administrator account.</p><ol><li>Create a Supabase project.</li><li>Apply the database migrations supplied with this repository.</li><li>Create your administrator account and add its user ID to the administrator allowlist.</li><li>Set the project URL and public publishable key in the local environment.</li></ol><p>The repository README contains the setup commands.</p></section>;
 if(access==='checking')return <p role="status" className="ws-loading">Checking administrator access…</p>;
 if(access==='signed-out')return <form className="panel login" onSubmit={signIn}><h2>Administrator sign-in</h2><p>Access is limited to approved administrators. Hunters sign in from <a href="#/account">their account page</a>.</p>{error&&<p className="notice error prose" role="alert">{error}</p>}<label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>;
 if(access==='denied')return <section className="panel"><h2>Administrator approval required</h2>{error&&<p className="notice error prose" role="alert">{error}</p>}<p>This account does not have access to administration. <a href="#/account">Go to your hunter account</a>.</p><button onClick={()=>void client!.auth.signOut()}>Sign out</button></section>;
 const waiting=queue?{registrations:queue.registrations||0,portraits:queue.portraits||0,reports:queue.reports||0,promotions:queue.promotions||0,suggestions:queue.suggestions||0}:null;
 const inboxTotal=waiting?Object.values(waiting).reduce((a,b)=>a+b,0):0;
 const fields=row?schemas[kind].fields.filter(f=>!(kind==='promotions'&&f.key==='hunt'&&standingConferred(row)&&!row.hunt)):[];
 const singular=schemas[kind].title.replace(/ies$/,'y').replace(/s$/,'');
 return <div className="workspace">
  <div className="ws-bar"><span>Signed in as administrator</span><div className="ws-bar-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>void backup()}>Export backup</button><button type="button" className="text-button" onClick={()=>guard(()=>void client!.auth.signOut())}>Sign out</button></div></div>
  <Tabs label="Administration" current={tab} onChange={t=>guard(()=>{open(null);setTab(t,...(t==='records'?[kind]:[]));})} tabs={[{id:'inbox',label:'Inbox',count:inboxTotal},{id:'records',label:'Records'},{id:'accounts',label:'Accounts',count:waiting?.registrations},{id:'forum',label:'Forum',count:waiting?.reports}]}/>
  {tab==='inbox'&&<TabPanel id="inbox">
   {!waiting?<p role="status" className="ws-loading">Loading what is waiting…</p>:inboxTotal===0?<div className="ws-empty"><strong>Nothing is waiting.</strong><p>New registrations, portraits, reports and suggestions appear here as they arrive.</p></div>:<>
    <p className="ws-lede">{plural(inboxTotal,'item needs','items need')} a decision. Each is handled here; nothing else on this page needs attention first.</p>
    {waiting.registrations>0&&<Accounts members={data.members} only="pending" onToast={toast}/>}
    {waiting.portraits>0&&<PortraitReview/>}
    {waiting.promotions>0&&<PromotionSuggestions data={data} onRecord={recordPromotion}/>}
    {waiting.reports>0&&<Reports/>}
    {waiting.suggestions>0&&<section className="panel"><h2>Glossary suggestions</h2><p className="section-note">{plural(waiting.suggestions,'suggested term is','suggested terms are')} waiting as drafts. Publish them from the glossary records when they are ready.</p><button type="button" className="primary" onClick={()=>{setKind('glossary');setFilter('draft');setQuery('');setTab('records','glossary');}}>Review glossary drafts</button></section>}
   </>}
  </TabPanel>}
  {tab==='records'&&<TabPanel id="records"><div className="ws-records">
   <nav className="ws-kinds" aria-label="Record types">{groups.map(([group,list])=><div key={group}><h3>{group}</h3>{list.filter(k=>kinds.includes(k)).map(k=><button type="button" key={k} aria-current={k===kind?'true':undefined} onClick={()=>pickKind(k)}><span>{schemas[k].title}</span><small>{data[k].length}</small></button>)}</div>)}</nav>
   <section className="ws-list" aria-label={schemas[kind].title}>
    <div className="ws-list-head"><h2>{schemas[kind].title}</h2><button type="button" className="primary" disabled={busy} onClick={()=>guard(()=>open({id:newId(kind),archived:false,published:false}))}>New {singular.toLowerCase()}</button></div>
    <div className="ws-tools"><label className="ws-search"><span className="sr-only">Search {schemas[kind].title.toLowerCase()}</span><input type="search" placeholder={`Search ${schemas[kind].title.toLowerCase()}`} value={query} onChange={e=>setQuery(e.target.value)}/></label>
     <div className="ws-filter" role="group" aria-label="Show">{filters.map(([f,name])=><button type="button" key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{name}<small>{f==='all'?data[kind].length:data[kind].filter(r=>statusOf(r)===f).length}</small></button>)}</div></div>
    {shown.length?<ul className="ws-rows">{shown.map(r=><li key={r.id}><button type="button" aria-current={row?.id===r.id?'true':undefined} onClick={()=>guard(()=>open({...r},null,r))}><span className="ws-row-name">{String(r.name||'Untitled')}</span><span className={`ws-tag is-${statusOf(r)}`}>{statusOf(r)==='draft'?'Draft':statusOf(r)==='published'?'Published':'Archived'}</span><small>{shortDate(r.updated_at)}</small></button></li>)}</ul>
     :<div className="ws-empty"><strong>{data[kind].length?'Nothing matches.':`No ${schemas[kind].title.toLowerCase()} yet.`}</strong><p>{data[kind].length?'Clear the search or choose another filter.':`Add the first one with “New ${singular.toLowerCase()}”.`}</p></div>}
   </section>
  </div></TabPanel>}
  {tab==='accounts'&&<TabPanel id="accounts"><Accounts members={data.members} only="all" onToast={toast}/></TabPanel>}
  {tab==='forum'&&<TabPanel id="forum"><Reports/><ForumSettings onToast={toast}/></TabPanel>}
  <Drawer open={!!row} busy={busy} dirty={dirty} error={error} onClose={()=>open(null)} onSubmit={save}
   kicker={`${schemas[kind].title} · ${replacing?'new assessment':existing?'edit':'new'}`} title={replacing?'New assessment':String(row?.name||(existing?'Untitled':`New ${singular.toLowerCase()}`))}
   footer={<><ReasonField value={reason} onChange={v=>{setReason(v);setReasonTyped(true);}} suggestions={replacing?['Stance reassessed','New information']:reasons}/><div className="form-actions"><button className="primary" type="submit">{busy?'Saving…':replacing?'Save new assessment':'Save'}</button><button type="button" onClick={()=>guard(()=>open(null))}>Cancel</button></div></>}>
   {row&&<>
    {replacing&&<p className="section-note">Replaces “{replacing.name}”. The earlier assessment is archived and stays in this direction’s history.</p>}
    {kind==='relations'&&existing&&!row.archived&&!replacing&&<p className="ws-aside"><button type="button" onClick={()=>open({id:newId('relations'),archived:false,published:row.published,name:'',from:row.from,to:row.to,stance:'',assessed:new Date().toISOString().slice(0,10)},data.relations.find(r=>r.id===row.id)!)}>Record a new assessment</button> <small>Use this when the stance changes, so the old one is kept.</small></p>}
    <StatusSwitch value={statusOf(row)} allowArchive={!replacing} onChange={s=>setRow({...row,published:s==='published',archived:s==='archived'})}/>
    <div className="ws-fields">{fields.map(f=><FieldInput key={f.key} field={f} row={row} setRow={setRow} data={data}/>)}</div>
    {kind==='promotions'&&standingConferred(row)&&<p className="field-note">Senior standing is conferred by the clan or the Council, so it is not linked to an undertaking.</p>}
    {kind==='members'&&<label className="checkbox"><input type="checkbox" checked={row.player_public===true} onChange={e=>setRow({...row,player_public:e.target.checked})}/>Show the player handle publicly</label>}
    <p className="record-id">{row.id}</p>
   </>}
  </Drawer>
  {toastNode}
 </div>;
}

const statusLabel={pending:'Waiting for approval',approved:'Approved',rejected:'Rejected',suspended:'Suspended'};
/** Account approval and hunter links. Accounts are shown by username; emails are never loaded. */
function Accounts({members,only,onToast}:{members:RecordData[];only:'pending'|'all';onToast:(t:string)=>void}){
 const [accounts,setAccounts]=useState<AccountRow[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[links,setLinks]=useState<Record<string,string>>({});
 const [query,setQuery]=useState(''),[renaming,setRenaming]=useState<{id:string;value:string}|null>(null);
 const refresh=async()=>{try{const rows=await listAccounts();setAccounts(rows);setLinks(Object.fromEntries(rows.map(r=>[r.id,r.member||(r.requested&&!rows.some(o=>o.member===r.requested&&o.id!==r.id)?r.requested:'')])));}catch(e){setError((e as Error).message);}};
 useEffect(()=>{void refresh();},[]);
 const name=(id:string|null)=>id?members.find(m=>m.id===id)?.name||id:null;
 const label=(a:AccountRow)=>a.username||`Account without username (registered ${a.created_at.slice(0,10)})`;
 async function decide(a:AccountRow,decision:'approved'|'rejected'|'suspended',done:string){if(busy)return;setBusy(true);setError('');try{await reviewAccount(a.id,decision,decision==='approved'?links[a.id]||null:null);onToast(done);await refresh();queueChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function rename(e:FormEvent,a:AccountRow){e.preventDefault();if(!renaming)return;const next=renaming.value.trim();if(!next||next===a.username){setRenaming(null);return;}if(!usernamePattern.test(next)){setError('Use 3 to 24 letters, numbers, dots, dashes or underscores, starting with a letter or number.');return;}if(busy)return;setBusy(true);setError('');try{await renameAccount(a.id,next);onToast(`${label(a)} is now ${next}.`);setRenaming(null);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 // Renaming happens in place instead of in a browser prompt.
 const nameCell=(a:AccountRow)=>renaming?.id===a.id?<form className="ws-rename" onSubmit={e=>void rename(e,a)}><label><span className="sr-only">New username</span><input autoFocus value={renaming.value} maxLength={24} onChange={e=>setRenaming({id:a.id,value:e.target.value})} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setRenaming(null);}}}/></label><button className="primary">Save</button><button type="button" onClick={()=>setRenaming(null)}>Cancel</button></form>
  :<span className="record-title">{label(a)}<button type="button" className="text-button ws-inline" onClick={()=>setRenaming({id:a.id,value:a.username||''})}>{a.username?'Rename':'Set username'}</button></span>;
 // A hunter is played by one account, so hunters linked elsewhere cannot be picked.
 const owner=(member:string)=>accounts?.find(x=>x.member===member);
 const hunterSelect=(a:AccountRow)=><label className="inline-select">Hunter<select value={links[a.id]||''} onChange={e=>setLinks({...links,[a.id]:e.target.value})}><option value="">Not linked</option>{active(members).map(m=>{const other=owner(m.id);const elsewhere=!!other&&other.id!==a.id;return <option key={m.id} value={m.id} disabled={elsewhere}>{m.name}{elsewhere?` (linked to ${label(other)})`:''}</option>;})}</select></label>;
 const q=query.trim().toLowerCase(),match=(a:AccountRow)=>!q||label(a).toLowerCase().includes(q)||String(name(a.member)||'').toLowerCase().includes(q);
 const pending=accounts?.filter(a=>a.status==='pending')||[],approved=(accounts?.filter(a=>a.status==='approved')||[]).filter(match),closed=(accounts?.filter(a=>a.status==='rejected'||a.status==='suspended')||[]).filter(match);
 return <section className="panel accounts" id="admin-accounts"><h2>{only==='pending'?'Registrations':'Accounts'}</h2>
  <p className="section-note">Approving links the account to the hunter you choose. A linked hunter can edit their own profile and declare undertakings; household seniors and hunters with Elder, Clan Leader or Ancient standing also judge undertakings. Emails are not shown here.</p>
  {error&&<p className="notice error prose" role="alert">{error}</p>}
  {accounts===null?!error&&<p role="status">Loading accounts…</p>:<fieldset disabled={busy} className="account-groups">
   <h3>Waiting for approval ({pending.length})</h3>
   {pending.length?<ul className="record-list">{pending.map(a=><li key={a.id}><div>{nameCell(a)}<small>Registered {a.created_at.slice(0,10)}{a.requested&&<> · says they play {name(a.requested)}</>}</small>{a.note&&<p className="prose">“{a.note}”</p>}</div><div className="account-actions">{hunterSelect(a)}<button className="primary" onClick={()=>void decide(a,'approved',`${label(a)} approved${links[a.id]?` and linked to ${name(links[a.id])}`:''}.`)}>Approve</button><button onClick={()=>void decide(a,'rejected',`${label(a)} rejected.`)}>Reject</button></div></li>)}</ul>:<p className="empty">No registrations waiting.</p>}
   {only==='all'&&<>
    <div className="ws-list-head"><h3>Approved ({approved.length})</h3><label className="ws-search"><span className="sr-only">Search accounts</span><input type="search" placeholder="Search accounts or hunters" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    {approved.length?<ul className="record-list">{approved.map(a=><li key={a.id}><div>{nameCell(a)}<small>{a.admin?'Administrator':'Member'}{a.member?<> · linked to {name(a.member)}</>:' · no hunter linked'}</small></div><div className="account-actions">{!a.admin&&<>{hunterSelect(a)}<button disabled={(links[a.id]||'')===(a.member||'')} onClick={()=>void decide(a,'approved',links[a.id]?`${label(a)} is linked to ${name(links[a.id])}.`:`${label(a)} is no longer linked to a hunter.`)}>Save link</button><button onClick={()=>{if(confirm(`Suspend ${label(a)}? They can no longer sign in to edit records.`))void decide(a,'suspended',`${label(a)} suspended.`);}}>Suspend</button></>}</div></li>)}</ul>:<p className="empty">{q?'No accounts match.':'No approved accounts.'}</p>}
    {closed.length>0&&<><h3>Rejected or suspended ({closed.length})</h3><ul className="record-list">{closed.map(a=><li key={a.id}><div>{nameCell(a)}<small>{statusLabel[a.status]}</small></div><button onClick={()=>void decide(a,'approved',`${label(a)} reinstated.`)}>Reinstate</button></li>)}</ul></>}
   </>}
  </fieldset>}
 </section>;
}
function ForumSettings({onToast}:{onToast:(t:string)=>void}){
 const [values,setValues]=useState<{days:string;cap:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{forumThreads().then(f=>setValues({days:String(f.settings.retention_days),cap:String(f.settings.thread_cap)})).catch(e=>setError((e as Error).message));},[]);
 async function save(e:FormEvent){e.preventDefault();if(!values||busy)return;if(!confirm('Messages outside the new limits are deleted straight away. Save the limits?'))return;setBusy(true);setError('');try{await forumConfigure(Number(values.days),Number(values.cap));onToast('Forum limits saved.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className="panel accounts" onSubmit={save}><h2>Forum limits</h2><p className="section-note">Messages older than the retention period are deleted, and each thread keeps only its newest messages up to the limit. Lowering either deletes messages straight away.</p>
  {error&&<p className="notice error prose" role="alert">{error}</p>}
  {values?<fieldset disabled={busy} className="link-account ws-fields"><label>Keep messages for (days)<input type="number" min={1} max={365} required value={values.days} onChange={e=>setValues({...values,days:e.target.value})}/></label><label>Messages kept per thread<input type="number" min={5} max={5000} required value={values.cap} onChange={e=>setValues({...values,cap:e.target.value})}/></label><div className="form-actions"><button className="primary">{busy?'Saving…':'Save limits'}</button></div></fieldset>:!error&&<p role="status">Loading forum limits…</p>}
 </form>;
}
