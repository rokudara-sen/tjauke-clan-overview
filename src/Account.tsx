import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { claimUsername, client, hunterSave, hunterWorkspace, myAccess, queueChanged, usernamePattern, type Access, type Workspace } from './service';
import { DeleteAccount, PortraitUpload, SuggestTerm, WitnessRequests } from './AccountExtras';
import { rankLabel, safeUrl, schemas, validate, type Dataset, type Kind, type RecordData } from './model';
import { FieldInput } from './Fields';
import { href } from './Visuals';
import { Drawer, ReasonField, TabPanel, Tabs, plural, useTab, useToast } from './Workspace';

// What each kind of hunter edit shows. The database enforces the same limits in public.hunter_save.
type Mode='profile'|'house'|'declare'|'report'|'judge'|'history'|'history-review';
const modes:Record<Mode,{kind:Kind;title:string;fields:string[];states?:string[];publish?:string;save:string;note:string;reason:string}>={
 profile:{kind:'members',title:'Your profile',fields:['epithet','biography','appearance','hooks','source'],save:'Save profile',note:'Changes appear on your public profile straight away.',reason:'Updated my profile'},
 house:{kind:'houses',title:'Edit household',fields:['meaning','vessel','history','identity'],save:'Save household',note:'As household senior, your changes appear on the household page straight away.',reason:'Updated household'},
 declare:{kind:'hunts',title:'Declare an undertaking',fields:['name','context','witness','date','era','quarry','weapon','limits','state','outside','source'],states:['Planned','Declared'],save:'Send declaration',note:'The declaration stays private until a judge publishes it.',reason:'Declared an undertaking'},
 report:{kind:'hunts',title:'Update your undertaking',fields:['name','context','witness','date','era','quarry','weapon','limits','state','outside','trophy','account','source'],states:['Planned','Declared','Underway','Completed','Withdrawn'],save:'Save undertaking',note:'You can update this until it is judged.',reason:'Updated the undertaking'},
 judge:{kind:'hunts',title:'Judge undertaking',fields:['review','judgment','state'],publish:'Publish this undertaking',save:'Save judgment',note:'Accepting a claim is separate from the hunt being completed.',reason:'Judged the undertaking'},
 history:{kind:'chronicle',title:'History entry',fields:['name','era','order','date','category','member','house','hunt','certainty','summary','body','source'],save:'Save draft',note:'Another hunter with senior standing or an administrator publishes it.',reason:'Drafted a history entry'},
 'history-review':{kind:'chronicle',title:'Review history entry',fields:['name','era','order','date','category','member','house','hunt','certainty','summary','body','source'],publish:'Publish this entry',save:'Save entry',note:'Once published, only an administrator can change it.',reason:'Reviewed the entry'},
};
const newId=(kind:Kind)=>`${schemas[kind].prefix}-${crypto.randomUUID()}`;
const tabs=['profile','undertakings','household','history','settings'] as const;
type Tab=typeof tabs[number];

export function Account({data,onChanged}:{data:Dataset;onChanged:()=>void}){
 const [state,setState]=useState<'checking'|'signed-out'|'ready'|'failed'>('checking'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[access,setAccess]=useState<Access|null>(null),[workspace,setWorkspace]=useState<Workspace|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<{mode:Mode;row:RecordData;original:string}|null>(null),[reason,setReason]=useState('');
 const [tab,setTab]=useTab<Tab>('account',tabs,'profile');
 const [toastNode,toast]=useToast();
 const load=useCallback(async()=>{if(!client)return;setState('checking');setError('');try{const {data:{session}}=await client.auth.getSession();if(!session){setState('signed-out');setAccess(null);setWorkspace(null);return;}const a=await myAccess();setAccess(a);setWorkspace(a.member&&a.status==='approved'?await hunterWorkspace():null);setState('ready');}catch(e){setError((e as Error).message);setState('failed');}},[]);
 useEffect(()=>{if(!client)return;void load();const {data:listener}=client.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>void load(),0);});return()=>listener.subscription.unsubscribe();},[load]);
 async function signIn(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const {error}=await client!.auth.signInWithPassword({email,password});if(error)throw error;setPassword('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const dirty=!!editing&&JSON.stringify(editing.row)!==editing.original;
 const guard=(next:()=>void)=>{if(!dirty||confirm('Discard your unsaved changes?'))next();};
 function edit(mode:Mode,row:RecordData){guard(()=>{setEditing({mode,row:{...row},original:JSON.stringify(row)});setReason(modes[mode].reason);setError('');});}
 async function save(e:FormEvent){
  e.preventDefault();if(!editing||busy||!workspace)return;const {mode,row}=editing,{kind}=modes[mode];
  // Validate against public records plus this hunter's own drafts, which the public archive does not include.
  const known={...data,hunts:[...data.hunts.filter(h=>!workspace.hunts.some(w=>w.id===h.id)),...workspace.hunts],chronicle:[...data.chronicle,...workspace.chronicle]};
  // Fields this hunter cannot edit are not theirs to fix, so only report on the fields shown.
  const hidden=schemas[kind].fields.filter(f=>!modes[mode].fields.includes(f.key)).map(f=>f.label);
  const errors=validate(kind,row,known).filter(e=>!hidden.some(l=>e.startsWith(`${l} `)));if(!reason.trim())errors.push('Add a change note.');if(errors.length){setError(errors.join('\n'));return;}
  setBusy(true);setError('');try{await hunterSave(kind,row,reason);setEditing(null);queueChanged();toast(mode==='declare'?'Declaration sent. It stays private until a judge publishes it.':mode==='history'?'History draft saved.':mode==='profile'?'Profile saved. It is live on your public page.':'Saved.');onChanged();setWorkspace(await hunterWorkspace());}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(!client)return <section className="panel setup"><h2>Accounts are not available in this preview</h2><p>Hunter sign-in needs the connected Supabase project.</p></section>;
 const alert=error&&!editing?<p className="notice error prose" role="alert">{error}</p>:null;
 if(state==='checking')return <p role="status" className="ws-loading">Checking your account…</p>;
 if(state==='signed-out')return <form className="panel login" onSubmit={signIn}><h2>Sign in</h2><p>No account yet? <a href={href('register')}>Request one</a>. An administrator approves new accounts.</p>{alert}<label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="form-actions"><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button><a className="quiet-link" href={href('reset')}>Forgot your password?</a></div></form>;
 const me=workspace?.member,portrait=me?safeUrl(data.members.find(m=>m.id===me.id)?.portrait??me.portrait):null;
 // Who is signed in, which hunter they are, and the places they can go from here.
 const identity=<header className="ws-identity">
  <div className="ws-avatar" aria-hidden="true">{portrait?<img src={portrait} alt=""/>:<span>{String(access?.name||access?.username||'?').slice(0,1)}</span>}</div>
  <div className="ws-who"><span className="ws-kicker">Signed in as {access?.username||'a member'}</span><strong>{access?.name||'No hunter linked'}</strong><small>{access?.member?[access.rank,access.standing].filter(Boolean).join(' · ')||'Rank not recorded':access?.admin?'Administrator':'Member'}</small></div>
  <div className="ws-bar-actions">{access?.member&&<a className="button-link" href={href('members',access.member)}>View public profile</a>}{access?.admin&&<a className="button-link" href={href('admin')}>Administration</a>}{access?.status==='approved'&&<a className="button-link" href={href('forum')}>Forum</a>}<button type="button" className="text-button" disabled={busy} onClick={()=>guard(()=>void client!.auth.signOut())}>Sign out</button></div>
 </header>;
 const settings=<div className="ws-settings"><PasswordForm onToast={toast}/>{access?.status==='approved'&&<SuggestTerm/>}<DeleteAccount username={access?.username||null} admin={!!access?.admin}/></div>;
 if(state==='failed')return <div className="workspace">{alert}<button onClick={()=>void load()}>Try again</button></div>;
 if(access&&access.status!=='approved'&&!access.admin)return <div className="workspace">{identity}{alert}<section className="panel" role="status"><h2>{access.status==='pending'?'Waiting for approval':access.status==='rejected'?'Registration not approved':'Account suspended'}</h2><p>{access.status==='pending'?'An administrator reviews new accounts. Your request is saved, so you can close this page and check back later.':access.status==='rejected'?'An administrator declined this registration. Contact the clan administrators if you think this is a mistake.':'An administrator suspended this account. Contact the clan administrators if you think this is a mistake.'}</p></section>{settings}{toastNode}</div>;
 if(access&&!access.username)return <div className="workspace">{identity}{alert}<ClaimUsername onDone={()=>void load()}/></div>;
 if(!access?.member||!workspace||!me)return <div className="workspace">{identity}{alert}<section className="panel"><h2>No hunter record linked</h2><p>{access?.admin?'Administrators work from the administration page. To also act as a hunter, link this account to a hunter record there.':'You can use the forum. To edit records, an administrator needs to link this account to your hunter record.'}</p></section>{settings}{toastNode}</div>;
 const judging=workspace.hunts.filter(h=>h.hunter!==me.id),mine=workspace.hunts.filter(h=>h.hunter===me.id),judge=access.elder||access.seniorOf.length>0;
 const reviewing=workspace.chronicle.filter(c=>!c.mine).length;
 const current=tab==='household'&&!workspace.houses.length||tab==='history'&&!access.elder?'profile':tab;
 return <div className="workspace">{identity}{alert}
  <WitnessRequests onChanged={onChanged}/>
  <Tabs label="Your account" current={current} onChange={t=>guard(()=>{setEditing(null);setTab(t);})} tabs={[
   {id:'profile',label:'Profile'},{id:'undertakings',label:'Undertakings',count:judge?judging.length:0},
   {id:'household',label:'Household',hidden:!workspace.houses.length},{id:'history',label:'History',count:reviewing,hidden:!access.elder},{id:'settings',label:'Settings'}]}/>
  {current==='profile'&&<TabPanel id="profile"><div className="ws-split">
   <ProfileForm me={me} data={data} busy={busy} onSave={async(row,note)=>{setBusy(true);setError('');try{await hunterSave('members',row,note);toast('Profile saved. It is live on your public page.');onChanged();setWorkspace(await hunterWorkspace());}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/>
   <aside><PortraitUpload member={me.id} current={data.members.find(m=>m.id===me.id)?.portrait??me.portrait}/>
    <section className="section"><div className="section-heading"><h2>Set by administrators</h2></div><dl className="ws-facts"><div><dt>Rank</dt><dd>{rankLabel(me)||'Not recorded'}</dd></div><div><dt>Household</dt><dd>{data.houses.find(h=>h.id===me.house)?.name||'Not recorded'}</dd></div><div><dt>Status</dt><dd>{String(me.status||'Not recorded')}</dd></div></dl><p className="section-note">Rank, standing, household, sponsor, duties and politics are changed by administrators.</p></section>
   </aside>
  </div></TabPanel>}
  {current==='undertakings'&&<TabPanel id="undertakings">
   <section className="section"><div className="section-heading"><h2>Your undertakings</h2><button type="button" className="primary" disabled={busy} onClick={()=>edit('declare',{id:newId('hunts'),archived:false,published:false,hunter:me.id,state:'Declared',outside:'Unknown',review:'Pending'})}>Declare an undertaking</button></div>
    {mine.length?<ul className="ws-rows">{mine.map(h=><li key={h.id}><button type="button" disabled={h.review!=='Pending'&&!h.published} onClick={()=>h.review==='Pending'?edit('report',h):location.assign(href('hunts',h.id))}><span className="ws-row-name">{h.name}</span><span className={`ws-tag is-${h.review==='Pending'?'draft':h.review==='Accepted'?'published':'archived'}`}>{h.review==='Pending'?'Awaiting judgment':`Claim ${String(h.review).toLowerCase()}`}</span><small>{[h.state,h.published?'published':'private'].join(' · ')}</small></button></li>)}</ul>
    :<div className="ws-empty"><strong>No undertakings yet.</strong><p>Declare one before the hunt. It stays private until a judge publishes it.</p></div>}
   </section>
   {judge&&<section className="section"><div className="section-heading"><h2>Awaiting your judgment</h2></div><p className="section-note">{access.elder?`As ${access.standing||'a hunter with senior standing'}, you can judge any hunter’s undertaking except your own.`:'As household senior, you judge undertakings of your household’s hunters.'}</p>
    {judging.length?<ul className="ws-rows">{judging.map(h=><li key={h.id}><button type="button" onClick={()=>edit('judge',h)}><span className="ws-row-name">{h.name}</span><span className="ws-tag is-draft">Judge</span><small>{[data.members.find(m=>m.id===h.hunter)?.name||'Hunter not published',h.state].join(' · ')}</small></button></li>)}</ul>:<div className="ws-empty"><strong>Nothing to judge.</strong><p>Undertakings you can judge appear here.</p></div>}
   </section>}
  </TabPanel>}
  {current==='household'&&<TabPanel id="household"><section className="section"><div className="section-heading"><h2>{plural(workspace.houses.length,'Household','Households')} you lead</h2></div><ul className="ws-rows">{workspace.houses.map(h=><li key={h.id}><button type="button" onClick={()=>edit('house',h)}><span className="ws-row-name">{h.name}</span><span className="ws-tag is-published">Edit</span><small>Household senior</small></button></li>)}</ul></section></TabPanel>}
  {current==='history'&&<TabPanel id="history"><section className="section"><div className="section-heading"><h2>History drafts</h2><button type="button" className="primary" disabled={busy} onClick={()=>edit('history',{id:newId('chronicle'),archived:false,published:false,category:'Other',certainty:'Recorded'})}>Add a history entry</button></div>
   {workspace.chronicle.length?<ul className="ws-rows">{workspace.chronicle.map(c=><li key={c.id}><button type="button" onClick={()=>edit(c.mine?'history':'history-review',c)}><span className="ws-row-name">{c.name}</span><span className={`ws-tag is-${c.mine?'archived':'draft'}`}>{c.mine?'Your draft':'Needs your review'}</span><small>{c.mine?'Waiting for another reviewer':'Written by another hunter'}</small></button></li>)}</ul>:<div className="ws-empty"><strong>No unpublished entries.</strong><p>Drafts you write, and drafts waiting for your review, appear here.</p></div>}
  </section></TabPanel>}
  {current==='settings'&&<TabPanel id="settings">{settings}</TabPanel>}
  {editing&&<Editor editing={editing} setRow={row=>setEditing({...editing,row})} data={{...data,hunts:[...data.hunts,...workspace.hunts.filter(h=>!data.hunts.some(p=>p.id===h.id))]}} reason={reason} setReason={setReason} busy={busy} error={error} dirty={dirty} onSave={save} onCancel={()=>setEditing(null)}/>}
  {toastNode}
 </div>;
}

/** The profile is the page's main job, so it is edited in place rather than behind a button. */
function ProfileForm({me,data,busy,onSave}:{me:RecordData;data:Dataset;busy:boolean;onSave:(row:RecordData,note:string)=>Promise<void>}){
 const [row,setRow]=useState<RecordData>({...me}),[note,setNote]=useState('Updated my profile');
 useEffect(()=>{setRow({...me});},[me]);
 const fields=schemas.members.fields.filter(f=>modes.profile.fields.includes(f.key)),dirty=JSON.stringify(row)!==JSON.stringify(me);
 return <form className="section ws-profile" onSubmit={e=>{e.preventDefault();if(dirty&&note.trim())void onSave(row,note);}}>
  <div className="section-heading"><h2>Your profile</h2><a href={href('members',me.id)} className="text-button">See it in public</a></div>
  <p className="section-note">{modes.profile.note}</p>
  <fieldset disabled={busy}><div className="ws-fields">{fields.map(f=><FieldInput key={f.key} field={f} row={row} setRow={setRow} data={data}/>)}</div>
   <div className="ws-save-row"><ReasonField value={note} onChange={setNote} suggestions={['Updated my profile','Fixed a typo','Added detail']}/><div className="form-actions"><button className="primary" disabled={!dirty||!note.trim()}>{busy?'Saving…':dirty?'Save profile':'No changes yet'}</button>{dirty&&<button type="button" onClick={()=>setRow({...me})}>Undo changes</button>}</div></div>
  </fieldset></form>;
}

function Editor({editing:{mode,row},setRow,data,reason,setReason,busy,error,dirty,onSave,onCancel}:{editing:{mode:Mode;row:RecordData};setRow:(r:RecordData)=>void;data:Dataset;reason:string;setReason:(v:string)=>void;busy:boolean;error:string;dirty:boolean;onSave:(e:FormEvent)=>void;onCancel:()=>void}){
 const m=modes[mode],fields=schemas[m.kind].fields.filter(f=>m.fields.includes(f.key));
 return <Drawer open busy={busy} dirty={dirty} error={error} onClose={onCancel} onSubmit={onSave} kicker={m.title} title={String(row.name||m.title)}
  footer={<><ReasonField value={reason} onChange={setReason} suggestions={[m.reason,'Correction','Added detail']}/><div className="form-actions"><button className="primary" type="submit">{busy?'Saving…':m.save}</button><button type="button" onClick={onCancel}>Cancel</button></div></>}>
  <p className="section-note">{m.note}</p>
  <div className="ws-fields">{fields.map(f=><FieldInput key={f.key} field={f} row={row} setRow={setRow} data={data} options={f.key==='state'?m.states:undefined}/>)}</div>
  {m.publish&&<label className="checkbox"><input type="checkbox" checked={row.published===true} onChange={e=>setRow({...row,published:e.target.checked})}/>{m.publish}</label>}
 </Drawer>;
}

function PasswordForm({onToast}:{onToast:(t:string)=>void}){
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function change(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const {error}=await client!.auth.updateUser({password});if(error)throw error;setPassword('');onToast('Password changed.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="section"><div className="section-heading"><h2>Password</h2></div><form onSubmit={change} className="ws-inline-form">{error&&<p className="notice error" role="alert">{error}</p>}<label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/><small className="field-note">At least 8 characters.</small></label><button className="primary" disabled={busy||password.length<8}>{busy?'Changing…':'Change password'}</button></form></section>;
}

function ClaimUsername({onDone}:{onDone:()=>void}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;if(!usernamePattern.test(name.trim())){setError('Use 3 to 24 letters, numbers, dots, dashes or underscores, starting with a letter or number.');return;}setBusy(true);setError('');try{await claimUsername(name.trim());onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className="panel login" onSubmit={submit}><h2>Choose a username</h2><p>Accounts now have usernames. Other members see it in the forum. Your email stays hidden. It cannot be changed later.</p>{error&&<p className="notice error" role="alert">{error}</p>}<label>Username<input autoComplete="username" required maxLength={24} value={name} onChange={e=>setName(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Saving…':'Save username'}</button></form>;
}
