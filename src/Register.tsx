import { useEffect, useState, type FormEvent } from 'react';
import { client, register, usernameAvailable, usernamePattern } from './service';
import { active, type Dataset } from './model';
import { href } from './Visuals';
type Availability='idle'|'checking'|'free'|'taken'|'invalid'|'unknown';
const availabilityText:Record<Availability,string>={idle:'3 to 24 characters: letters, numbers, dot, dash or underscore.',checking:'Checking…',free:'Available.',taken:'Already taken.',invalid:'Use 3 to 24 letters, numbers, dots, dashes or underscores, starting with a letter or number.',unknown:'Availability could not be checked. It is checked again when you send the request.'};

export function Register({data}:{data:Dataset}){
 const [form,setForm]=useState({username:'',email:'',password:'',member:'',note:''}),[availability,setAvailability]=useState<Availability>('idle'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<{confirmEmail:boolean}|null>(null);
 const set=(key:keyof typeof form)=>(e:{target:{value:string}})=>setForm(f=>({...f,[key]:e.target.value}));
 useEffect(()=>{const name=form.username.trim();if(!name){setAvailability('idle');return;}if(!usernamePattern.test(name)){setAvailability('invalid');return;}
  setAvailability('checking');let current=true;const t=setTimeout(()=>{usernameAvailable(name).then(ok=>{if(current)setAvailability(ok?'free':'taken');}).catch(()=>{if(current)setAvailability('unknown');});},350);return()=>{current=false;clearTimeout(t);};},[form.username]);
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setError('');
  if(availability==='taken'||availability==='invalid'){setError(availabilityText[availability]);return;}
  setBusy(true);try{setDone(await register(form.email.trim(),form.password,form.username.trim(),form.member,form.note.trim()));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!client)return <section className="panel setup"><h2>Registration is not available in this preview</h2><p>Accounts need the connected Supabase project.</p></section>;
 if(done)return <section className="panel login" role="status"><h2>Request sent</h2><p>{done.confirmEmail?'Confirm your email address with the link we sent you. After that, an administrator reviews the request.':'An administrator reviews the request. You can sign in to see whether it has been approved.'}</p><a className="button-link" href={href('account')}>Go to sign-in</a></section>;
 const hunters=active(data.members).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 return <form className="panel register" onSubmit={submit}><p>An administrator approves every account before it can post in the forum or edit records.</p>
  {error&&<p className="notice error prose" role="alert">{error}</p>}
  <fieldset disabled={busy}>
   <label>Username *<input autoComplete="username" required maxLength={24} value={form.username} onChange={set('username')} aria-describedby="username-status" aria-invalid={availability==='taken'||availability==='invalid'}/></label>
   <p id="username-status" className={`field-note availability-${availability}`} aria-live="polite">{availabilityText[availability]} Shown to other members.</p>
   <label>Email *<input type="email" autoComplete="email" required value={form.email} onChange={set('email')} aria-describedby="email-note"/></label>
   <p id="email-note" className="field-note">Only used to sign in. Never shown on the site, including to administrators.</p>
   <label>Password *<input type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} aria-describedby="password-note"/></label>
   <p id="password-note" className="field-note">At least 8 characters.</p>
   <label>Which hunter do you play?<select value={form.member} onChange={set('member')}><option value="">None yet</option>{hunters.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
   <p className="field-note">An administrator confirms this before linking it.</p>
   <label>Note to administrators<textarea rows={3} maxLength={500} value={form.note} onChange={set('note')} aria-describedby="note-note"/></label>
   <p id="note-note" className="field-note">Optional. Helps them recognise you, for example your Discord name.</p>
   <div className="form-actions"><button className="primary" type="submit">{busy?'Sending…':'Request an account'}</button><a className="button-link" href={href('account')}>I already have an account</a></div>
  </fieldset></form>;
}
