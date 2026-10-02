import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { claimUsername, client, hunterSave, hunterWorkspace, myAccess, queueChanged, usernamePattern, type Access, type Workspace } from './service';
import { DeleteAccount, Group, PortraitUpload, SuggestTerm, WitnessRequests } from './AccountExtras';
import { rankLabel, schemas, validate, type Dataset, type Kind, type RecordData } from './model';
import { FieldInput } from './Fields';
import { href } from './Visuals';

// What each kind of hunter edit shows. The database enforces the same limits in public.hunter_save.
type Mode='profile'|'house'|'declare'|'report'|'judge'|'history'|'history-review';
const modes:Record<Mode,{kind:Kind;title:string;fields:string[];states?:string[];publish?:string;save:string;note:string}>={
 profile:{kind:'members',title:'Edit your profile',fields:['epithet','biography','appearance','hooks','source'],save:'Save profile',note:'Changes appear on your public profile straight away.'},
 house:{kind:'houses',title:'Edit household',fields:['meaning','vessel','history','identity'],save:'Save household',note:'As household senior, your changes appear on the household page straight away.'},
 declare:{kind:'hunts',title:'Declare an undertaking',fields:['name','context','witness','date','era','quarry','weapon','limits','state','outside','source'],states:['Planned','Declared'],save:'Send declaration',note:'The declaration stays private until a judge publishes it.'},
 report:{kind:'hunts',title:'Update your undertaking',fields:['name','context','witness','date','era','quarry','weapon','limits','state','outside','trophy','account','source'],states:['Planned','Declared','Underway','Completed','Withdrawn'],save:'Save undertaking',note:'You can update this until it is judged.'},
 judge:{kind:'hunts',title:'Judge undertaking',fields:['review','judgment','state'],publish:'Publish this undertaking',save:'Save judgment',note:'Accepting a claim is separate from the hunt being completed.'},
 history:{kind:'chronicle',title:'History entry',fields:['name','era','order','date','category','member','house','hunt','certainty','summary','body','source'],save:'Save draft',note:'Another hunter with senior standing or an administrator publishes it.'},
 'history-review':{kind:'chronicle',title:'Review history entry',fields:['name','era','order','date','category','member','house','hunt','certainty','summary','body','source'],publish:'Publish this entry',save:'Save entry',note:'Once published, only an administrator can change it.'},
};
const newId=(kind:Kind)=>`${schemas[kind].prefix}-${crypto.randomUUID()}`;

export function Account({data,onChanged}:{data:Dataset;onChanged:()=>void}){
 const [state,setState]=useState<'checking'|'signed-out'|'ready'|'failed'>('checking'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[access,setAccess]=useState<Access|null>(null),[workspace,setWorkspace]=useState<Workspace|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[editing,setEditing]=useState<{mode:Mode;row:RecordData}|null>(null),[reason,setReason]=useState('');
 const load=useCallback(async()=>{if(!client)return;setState('checking');try{const {data:{session}}=await client.auth.getSession();if(!session){setState('signed-out');setAccess(null);setWorkspace(null);return;}const a=await myAccess();setAccess(a);setWorkspace(a.member&&a.status==='approved'?await hunterWorkspace():null);setState('ready');}catch(e){setError((e as Error).message);setState('failed');}},[]);
 useEffect(()=>{if(!client)return;void load();const {data:listener}=client.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>void load(),0);});return()=>listener.subscription.unsubscribe();},[load]);
 async function signIn(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const {error}=await client!.auth.signInWithPassword({email,password});if(error)throw error;setPassword('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function edit(mode:Mode,row:RecordData){setEditing({mode,row:{...row}});setReason('');setError('');setMessage('');}
 async function save(e:FormEvent){
  e.preventDefault();if(!editing||busy||!workspace)return;const {mode,row}=editing,{kind}=modes[mode];
  // Validate against public records plus this hunter's own drafts, which the public archive does not include.
  const known={...data,hunts:[...data.hunts.filter(h=>!workspace.hunts.some(w=>w.id===h.id)),...workspace.hunts],chronicle:[...data.chronicle,...workspace.chronicle]};
  // Fields this hunter cannot edit are not theirs to fix, so only report on the fields shown.
  const hidden=schemas[kind].fields.filter(f=>!modes[mode].fields.includes(f.key)).map(f=>f.label);
  const errors=validate(kind,row,known).filter(e=>!hidden.some(l=>e.startsWith(`${l} `)));if(!reason.trim())errors.push('A change note is required.');if(errors.length){setError(errors.join('\n'));return;}
  setBusy(true);setError('');try{await hunterSave(kind,row,reason);setEditing(null);queueChanged();setMessage(mode==='declare'?'Declaration sent. It stays private until a judge publishes it.':mode==='history'?'History draft saved.':'Saved.');onChanged();setWorkspace(await hunterWorkspace());}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(!client)return <section className="panel setup"><h2>Accounts are not available in this preview</h2><p>Hunter sign-in needs the connected Supabase project.</p></section>;
 const alerts=<>{error&&<p className="notice error prose" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}</>;
 if(state==='checking')return <p role="status">Checking your account…</p>;
 if(state==='signed-out')return <>{alerts}<form className="panel login" onSubmit={signIn}><h2>Sign in</h2><p>No account yet? <a href={href('register')}>Request one</a>. An administrator approves new accounts.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="form-actions"><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button><a className="quiet-link" href={href('reset')}>Forgot your password?</a></div></form></>;
 const extras=<div className="account-extras">{access?.status==='approved'&&<SuggestTerm/>}<PasswordForm/><DeleteAccount username={access?.username||null} admin={!!access?.admin}/></div>;
 const header=<div className="account-bar"><p>{access?.username?<>Signed in as <strong>{access.username}</strong></>:'Signed in'}{access?.member&&<>, linked to <a href={href('members',access.member)}>{access.name}</a> ({access.standing||access.rank||'rank not recorded'})</>}.</p><div className="form-actions">{access?.admin&&<a className="button-link" href={href('admin')}>Administration</a>}{access?.status==='approved'&&<a className="button-link" href={href('forum')}>Forum</a>}<button disabled={busy} onClick={()=>void client!.auth.signOut()}>Sign out</button></div></div>;
 if(state==='failed')return <>{header}{alerts}<button onClick={()=>void load()}>Try again</button></>;
 if(access&&access.status!=='approved'&&!access.admin)return <>{header}{alerts}<section className="panel" role="status"><h2>{access.status==='pending'?'Waiting for approval':access.status==='rejected'?'Registration not approved':'Account suspended'}</h2><p>{access.status==='pending'?'An administrator reviews new accounts. Your request is saved, so you can close this page and check back later.':access.status==='rejected'?'An administrator declined this registration. Contact the clan administrators if you think this is a mistake.':'An administrator suspended this account. Contact the clan administrators if you think this is a mistake.'}</p></section>{extras}</>;
 if(access&&!access.username)return <>{header}{alerts}<ClaimUsername onDone={()=>void load()}/></>;
 if(!access?.member||!workspace)return <>{header}{alerts}<section className="panel"><h2>No hunter record linked</h2><p>{access?.admin?'Administrators work from the administration page. To also act as a hunter, link this account to a hunter record there.':'You can use the forum. To edit records, an administrator needs to link this account to your hunter record.'}</p></section>{extras}</>;
 const me=workspace.member,judging=workspace.hunts.filter(h=>h.hunter!==me.id),mine=workspace.hunts.filter(h=>h.hunter===me.id);
 const judge=access.elder||access.seniorOf.length>0;
 return <>{header}{alerts}<div className="admin-grid account-grid"><div>
  <WitnessRequests onChanged={onChanged}/>
  <Group title="Your record"><ul className="record-list"><li><div><a className="record-title" href={href('members',me.id)}>{me.name}</a><small>{[rankLabel(me),data.houses.find(h=>h.id===me.house)?.name,me.status].filter(Boolean).join(' · ')}</small></div><button disabled={busy} onClick={()=>edit('profile',me)}>Edit profile</button></li></ul></Group>
  <PortraitUpload member={me.id} current={data.members.find(m=>m.id===me.id)?.portrait??me.portrait}/>
  {workspace.houses.length>0&&<Group title="Your household"><ul className="record-list">{workspace.houses.map(h=><li key={h.id}><div><a className="record-title" href={href('houses',h.id)}>{h.name}</a><small>Household senior</small></div><button disabled={busy} onClick={()=>edit('house',h)}>Edit household</button></li>)}</ul></Group>}
  <Group title="Your undertakings" action={<button disabled={busy} onClick={()=>edit('declare',{id:newId('hunts'),archived:false,published:false,hunter:me.id,state:'Declared',outside:'Unknown',review:'Pending'})}>Declare an undertaking</button>}>
   {mine.length?<ul className="record-list">{mine.map(h=><li key={h.id}><div><span className="record-title">{h.name}</span><small>{[h.state,h.review==='Pending'?'awaiting judgment':`claim ${String(h.review).toLowerCase()}`,h.published?'published':'not published'].join(' · ')}</small></div>{h.review==='Pending'?<button disabled={busy} onClick={()=>edit('report',h)}>Update</button>:h.published?<a href={href('hunts',h.id)}>View</a>:null}</li>)}</ul>:<p className="empty">You have not declared any undertakings.</p>}
  </Group>
  {judge&&<Group title="Awaiting judgment"><p className="section-note">{access.elder?'As '+(access.standing||'a hunter with senior standing')+', you can judge any hunter’s undertaking except your own.':'As household senior, you judge undertakings of your household’s hunters.'}</p>{judging.length?<ul className="record-list">{judging.map(h=><li key={h.id}><div><span className="record-title">{h.name}</span><small>{[data.members.find(m=>m.id===h.hunter)?.name||'Hunter not published',h.state,h.published?'published':'not published'].join(' · ')}</small></div><button disabled={busy} onClick={()=>edit('judge',h)}>Judge</button></li>)}</ul>:<p className="empty">Nothing is waiting for judgment.</p>}</Group>}
  {access.elder&&<Group title="History drafts" action={<button disabled={busy} onClick={()=>edit('history',{id:newId('chronicle'),archived:false,published:false,category:'Other',certainty:'Recorded'})}>Add a history entry</button>}>{workspace.chronicle.length?<ul className="record-list">{workspace.chronicle.map(c=><li key={c.id}><div><span className="record-title">{c.name}</span><small>{c.mine?'Your draft, waiting for another reviewer':'Waiting for your review'}</small></div><button disabled={busy} onClick={()=>edit(c.mine?'history':'history-review',c)}>{c.mine?'Edit':'Review'}</button></li>)}</ul>:<p className="empty">No unpublished history entries.</p>}</Group>}
 </div>
 {editing?<Editor editing={editing} setRow={row=>setEditing({...editing,row})} data={{...data,hunts:[...data.hunts,...workspace.hunts.filter(h=>!data.hunts.some(p=>p.id===h.id))]}} reason={reason} setReason={setReason} busy={busy} onSave={save} onCancel={()=>setEditing(null)}/>
 :<section className="panel"><h2>What you can change</h2><ul className="permissions">
  <li>Your epithet, biography, appearance, roleplay hooks and profile link. These go live straight away.</li>
  <li>Declare undertakings and write their account until they are judged.</li>
  {access.seniorOf.length>0&&<li>Your household’s meaning, holding, history and customs.</li>}
  {judge&&<li>Judge and publish {access.elder?'any hunter’s':'your household’s'} undertakings.</li>}
  {access.elder&&<li>Add history entries as drafts, and publish drafts written by others.</li>}
  <li className="muted">Rank, standing, household, sponsor, duties and politics are set by administrators.</li>
 </ul></section>}
 </div>{extras}</>;
}


function Editor({editing:{mode,row},setRow,data,reason,setReason,busy,onSave,onCancel}:{editing:{mode:Mode;row:RecordData};setRow:(r:RecordData)=>void;data:Dataset;reason:string;setReason:(v:string)=>void;busy:boolean;onSave:(e:FormEvent)=>void;onCancel:()=>void}){
 const m=modes[mode],fields=schemas[m.kind].fields.filter(f=>m.fields.includes(f.key));
 return <form className="panel editor" onSubmit={onSave}><h2>{m.title}</h2><p className="section-note">{row.name&&mode!=='declare'&&mode!=='history'?<><strong>{String(row.name)}</strong>. </>:null}{m.note}</p>
  <fieldset disabled={busy}>{fields.map(f=><FieldInput key={f.key} field={f} row={row} setRow={setRow} data={data} options={f.key==='state'?m.states:undefined}/>)}
  {m.publish&&<label className="checkbox"><input type="checkbox" checked={row.published===true} onChange={e=>setRow({...row,published:e.target.checked})}/>{m.publish}</label>}
  <label>Change note *<textarea rows={2} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="What changed and why"/></label>
  <div className="form-actions"><button className="primary" type="submit">{busy?'Saving…':m.save}</button><button type="button" onClick={onCancel}>Cancel</button></div></fieldset></form>;
}

function PasswordForm(){
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<{ok:boolean;text:string}|null>(null);
 async function change(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setResult(null);try{const {error}=await client!.auth.updateUser({password});if(error)throw error;setPassword('');setResult({ok:true,text:'Password changed.'});}catch(e){setResult({ok:false,text:(e as Error).message});}finally{setBusy(false);}}
 return <details className="password"><summary>Change password</summary><form onSubmit={change}>{result&&<p className={result.ok?'notice':'notice error'} role={result.ok?'status':'alert'}>{result.text}</p>}<label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Changing…':'Change password'}</button></form></details>;
}

function ClaimUsername({onDone}:{onDone:()=>void}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;if(!usernamePattern.test(name.trim())){setError('Use 3 to 24 letters, numbers, dots, dashes or underscores, starting with a letter or number.');return;}setBusy(true);setError('');try{await claimUsername(name.trim());onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className="panel login" onSubmit={submit}><h2>Choose a username</h2><p>Accounts now have usernames. Other members see it in the forum. Your email stays hidden. It cannot be changed later.</p>{error&&<p className="notice error" role="alert">{error}</p>}<label>Username<input autoComplete="username" required maxLength={24} value={name} onChange={e=>setName(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Saving…':'Save username'}</button></form>;
}
