import { useEffect, useState, type FormEvent } from 'react';
import { client, requestPasswordReset, setPassword } from './service';
import { href } from './Visuals';
// The reset link signs the person in (PKCE ?code=) and carries ?reset=1. Without both, the page asks for an email instead.
const fromResetLink=()=>new URLSearchParams(location.search).has('reset');
const clearLinkParams=()=>history.replaceState(null,'',`${location.pathname}${location.hash}`);

export function ResetPassword(){
 const [mode,setMode]=useState<'checking'|'request'|'choose'|'sent'|'done'>('checking'),[email,setEmail]=useState(''),[password,setPasswordValue]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!client)return;let alive=true;
  // The code exchange can finish just after the page renders, so wait for the session briefly when arriving from a link.
  const decide=async()=>{const {data:{session}}=await client!.auth.getSession();if(alive)setMode(session&&fromResetLink()?'choose':fromResetLink()?'checking':'request');};
  void decide();const {data:listener}=client.auth.onAuthStateChange(()=>void decide());
  const giveUp=setTimeout(()=>{if(alive)setMode(m=>m==='checking'?'request':m);},4000);
  return()=>{alive=false;clearTimeout(giveUp);listener.subscription.unsubscribe();};},[]);
 async function send(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await requestPasswordReset(email.trim());setMode('sent');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();if(busy)return;if(password!==repeat){setError('The two passwords do not match.');return;}setBusy(true);setError('');try{await setPassword(password);clearLinkParams();setMode('done');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!client)return <section className="panel setup"><h2>Password reset is not available in this preview</h2><p>It needs the connected Supabase project.</p></section>;
 const alert=error&&<p className="notice error prose" role="alert">{error}</p>;
 if(mode==='checking')return <p role="status">Opening your reset link…</p>;
 if(mode==='sent')return <section className="panel login" role="status"><h2>Check your email</h2><p>If an account uses {email.trim()}, a reset link is on its way. The link works once and expires after a while.</p><a className="button-link" href={href('account')}>Back to sign-in</a></section>;
 if(mode==='done')return <section className="panel login" role="status"><h2>Password changed</h2><p>You are signed in with the new password.</p><a className="button-link" href={href('account')}>Go to your account</a></section>;
 if(mode==='choose')return <form className="panel login" onSubmit={save}><h2>Choose a new password</h2>{alert}<fieldset disabled={busy}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPasswordValue(e.target.value)} autoFocus/></label><label>Repeat the new password<input type="password" autoComplete="new-password" minLength={8} required value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><button className="primary">{busy?'Saving…':'Save new password'}</button></fieldset></form>;
 return <form className="panel login" onSubmit={send}><h2>Forgot your password?</h2><p>Enter the email you registered with. We send a link to choose a new password.</p>{alert}<fieldset disabled={busy}><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><div className="form-actions"><button className="primary">{busy?'Sending…':'Send reset link'}</button><a className="button-link" href={href('account')}>Back to sign-in</a></div></fieldset></form>;
}
